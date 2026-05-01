import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common'
import { RabbitMqConnection } from '@flowmesh/nestjs-common'
import { FlowMeshEvent, Pipeline, PipelineStep } from '@flowmesh/shared-types'
import { Channel, ConsumeMessage } from 'amqplib'
import { PrismaService } from '../prisma/prisma.service'
import { RedisService } from '../redis/redis.service'
import { ConfigClientService } from '../config-client/config-client.service'
import { FilterStepExecutor } from '../steps/filter/filter-step.executor'
import { TransformStepExecutor } from '../steps/transform/transform-step.executor'
import { EnrichStepExecutor } from '../steps/enrich/enrich-step.executor'
import { FanoutService } from '../fanout/fanout.service'

const INGESTION_EXCHANGE = 'flowmesh.events'
const PIPELINE_QUEUE = 'pipeline.queue'
const PIPELINE_ROUTING_KEY = 'event.ingested'
const DLQ_EXCHANGE = 'flowmesh.dlq'
const DLQ_ROUTING_KEY = 'dead.pipeline'
const MAX_CHANNEL_RETRIES = 10
const BASE_DELAY_MS = 1000
const MAX_DELAY_MS = 30000

interface QueueMessageMeta {
  messageId: string
  correlationId: string
  timestamp: string
  source: string
  version: string
  workspaceId: string
}

interface QueueMessagePayload {
  eventId: string
  event: string
  source: string
  version: string
  userId?: string
  anonymousId?: string
  sessionId?: string
  properties: Record<string, unknown>
  context: Record<string, unknown>
  receivedAt: string
}

interface QueueMessage {
  meta: QueueMessageMeta
  payload: QueueMessagePayload
}

@Injectable()
export class ConsumerService implements OnModuleInit, OnModuleDestroy {
  private channel!: Channel
  private shuttingDown = false
  private readonly logger = new Logger(ConsumerService.name)

  constructor(
    private readonly connection: RabbitMqConnection,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly configClient: ConfigClientService,
    private readonly filterStep: FilterStepExecutor,
    private readonly transformStep: TransformStepExecutor,
    private readonly enrichStep: EnrichStepExecutor,
    private readonly fanout: FanoutService,
  ) {}

  async onModuleInit() {
    await this.setupChannel()
  }

  async onModuleDestroy() {
    this.shuttingDown = true
    try {
      await this.channel?.close()
    } catch {
      // ignore on shutdown
    }
  }

  private async setupChannel(): Promise<void> {
    const conn = this.connection.getConnection()
    this.channel = await conn.createChannel()

    await this.channel.assertExchange(DLQ_EXCHANGE, 'topic', { durable: true })
    await this.channel.assertQueue(PIPELINE_QUEUE, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': DLQ_EXCHANGE,
        'x-dead-letter-routing-key': DLQ_ROUTING_KEY,
      },
    })
    await this.channel.bindQueue(PIPELINE_QUEUE, INGESTION_EXCHANGE, PIPELINE_ROUTING_KEY)

    this.channel.prefetch(10)
    await this.channel.consume(PIPELINE_QUEUE, (msg) => this.handleMessage(msg))

    this.channel.on('close', () => {
      if (!this.shuttingDown) {
        this.logger.warn('consumer channel closed — recreating...')
        this.recreateChannel().catch((err: Error) => {
          this.logger.error(`consumer channel recreation failed permanently: ${err.message}`)
        })
      }
    })

    this.logger.log('consumer ready — listening on pipeline.queue')
  }

  private async handleMessage(msg: ConsumeMessage | null): Promise<void> {
    if (!msg) return

    let parsed: QueueMessage
    try {
      parsed = JSON.parse(msg.content.toString()) as QueueMessage
    } catch {
      this.logger.error('received unparseable message — sending to DLQ')
      this.channel.nack(msg, false, false)
      return
    }

    const { meta, payload } = parsed

    // 1. Idempotency — skip if already fully processed
    const alreadyProcessed = await this.redis.isMessageProcessed(meta.messageId)
    if (alreadyProcessed) {
      this.logger.debug({ messageId: meta.messageId }, 'duplicate message — acking without processing')
      this.channel.ack(msg)
      return
    }

    // 2. Reconstruct FlowMeshEvent from payload
    const event: FlowMeshEvent = {
      event: payload.event,
      correlationId: meta.correlationId,
      eventId: payload.eventId,
      timestamp: payload.receivedAt,
      source: payload.source,
      version: payload.version,
      userId: payload.userId,
      anonymousId: payload.anonymousId,
      sessionId: payload.sessionId,
      properties: payload.properties,
      context: payload.context as FlowMeshEvent['context'],
    }

    // 3. Load matching pipelines
    let pipelines: Pipeline[]
    try {
      pipelines = await this.configClient.getPipelinesForWorkspace(meta.workspaceId)
    } catch (err) {
      const error = err as Error
      this.logger.error({ messageId: meta.messageId, err: error.message }, 'failed to load pipelines — nacking to DLQ')
      this.channel.nack(msg, false, false)
      return
    }

    const matchingPipelines = pipelines.filter(
      (p) => p.enabled && p.trigger.events.includes(payload.event),
    )

    if (matchingPipelines.length === 0) {
      this.logger.debug({ messageId: meta.messageId, event: payload.event }, 'no matching pipelines — acking')
      this.channel.ack(msg)
      return
    }

    // 4. Run saga for each matching pipeline
    try {
      for (const pipeline of matchingPipelines) {
        await this.runPipelineSaga(pipeline, event, meta)
      }
    } catch (err) {
      const error = err as Error
      this.logger.error({ messageId: meta.messageId, err: error.message }, 'pipeline saga failed — nacking to DLQ')
      this.channel.nack(msg, false, false)
      return
    }

    // 5. Commit: mark messageId as processed, then ack
    await this.redis.markMessageProcessed(meta.messageId)
    this.channel.ack(msg)
    this.logger.log({ messageId: meta.messageId, pipelines: matchingPipelines.length }, 'message processed successfully')
  }

  private async runPipelineSaga(
    pipeline: Pipeline,
    event: FlowMeshEvent,
    meta: QueueMessageMeta,
  ): Promise<void> {
    // Filter step — clean skip if event doesn't match (no execution record)
    const filterStep = pipeline.steps.find((s: PipelineStep) => s.type === 'filter')
    if (filterStep) {
      const passes = this.filterStep.execute(event, filterStep.config)
      if (!passes) {
        this.logger.debug({ pipelineId: pipeline.id, messageId: meta.messageId }, 'event filtered out')
        return
      }
    }

    // Create execution record after filter passes
    const execution = await this.prisma.pipelineExecution.create({
      data: {
        workspaceId: meta.workspaceId,
        pipelineId: pipeline.id,
        eventId: event.eventId,
        messageId: meta.messageId,
        status: 'running',
      },
    })

    try {
      // Transform step
      let processedEvent = event
      const transformStepCfg = pipeline.steps.find((s: PipelineStep) => s.type === 'transform')
      if (transformStepCfg) {
        processedEvent = this.transformStep.execute(processedEvent, transformStepCfg.config)
      }

      // Enrich step
      const enrichStepCfg = pipeline.steps.find((s: PipelineStep) => s.type === 'enrich')
      if (enrichStepCfg) {
        processedEvent = this.enrichStep.execute(processedEvent, enrichStepCfg.config)
      }

      // Fan-out — one message per destination step
      const destinationSteps = pipeline.steps.filter((s: PipelineStep) => s.type === 'destination')
      for (const step of destinationSteps) {
        const destinationId = (step.config as Record<string, unknown>)['destinationId'] as string
        await this.fanout.publishToDestination(execution.id, destinationId, processedEvent)
      }

      await this.prisma.pipelineExecution.update({
        where: { id: execution.id },
        data: { status: 'completed', completedAt: new Date() },
      })
    } catch (err) {
      const error = err as Error
      await this.prisma.pipelineExecution.update({
        where: { id: execution.id },
        data: { status: 'failed', completedAt: new Date(), error: error.message },
      })
      throw err
    }
  }

  private async recreateChannel(attempt = 0): Promise<void> {
    try {
      await this.setupChannel()
    } catch (err) {
      if (this.shuttingDown) return
      if (attempt >= MAX_CHANNEL_RETRIES) throw err

      const delay = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS)
      await new Promise((resolve) => setTimeout(resolve, delay))
      await this.recreateChannel(attempt + 1)
    }
  }
}
