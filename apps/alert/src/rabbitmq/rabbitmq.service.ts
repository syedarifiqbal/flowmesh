import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common'
import { RabbitMqConnection } from '@flowmesh/nestjs-common'
import { Channel } from 'amqplib'
import { EvaluatorService, IngestedEvent } from '../evaluator/evaluator.service'

const EXCHANGE = 'flowmesh.events'
const QUEUE = 'flowmesh.alert.evaluation'
const ROUTING_KEY = 'event.ingested'
const MAX_CHANNEL_RETRIES = 10
const BASE_DELAY_MS = 1000
const MAX_DELAY_MS = 30000

@Injectable()
export class RabbitMQConsumerService implements OnModuleInit, OnModuleDestroy {
  private channel!: Channel
  private shuttingDown = false
  private readonly logger = new Logger(RabbitMQConsumerService.name)

  constructor(
    private readonly connection: RabbitMqConnection,
    private readonly evaluator: EvaluatorService,
  ) {}

  async onModuleInit() {
    await this.setupChannel()
  }

  async onModuleDestroy() {
    this.shuttingDown = true
    try {
      await this.channel?.close()
    } catch {
      // ignore
    }
  }

  private async setupChannel(): Promise<void> {
    const conn = this.connection.getConnection()
    this.channel = await conn.createChannel()

    await this.channel.assertExchange(EXCHANGE, 'topic', { durable: true })
    await this.channel.assertQueue(QUEUE, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': 'flowmesh.dlq',
        'x-dead-letter-routing-key': 'dlq.alert.evaluation',
      },
    })
    await this.channel.bindQueue(QUEUE, EXCHANGE, ROUTING_KEY)
    this.channel.prefetch(10)

    await this.channel.consume(QUEUE, async (msg) => {
      if (!msg) return

      try {
        const raw = JSON.parse(msg.content.toString()) as {
          meta: { workspaceId: string; correlationId: string }
          payload: { eventId?: string; event: string; userId?: string; anonymousId?: string; properties?: Record<string, unknown> }
        }
        const event: IngestedEvent = {
          eventId: raw.payload.eventId,
          eventName: raw.payload.event,
          workspaceId: raw.meta.workspaceId,
          userId: raw.payload.userId,
          anonymousId: raw.payload.anonymousId,
          properties: raw.payload.properties,
        }
        await this.evaluator.evaluate(event)
        this.channel.ack(msg)
      } catch (err) {
        this.logger.error({ err }, 'failed to process alert evaluation message')
        this.channel.nack(msg, false, false) // dead-letter on failure
      }
    })

    this.channel.on('close', () => {
      if (!this.shuttingDown) {
        this.logger.warn('RabbitMQ channel closed — recreating...')
        this.recreateChannel().catch((err) => {
          this.logger.error({ err }, 'failed to recreate channel')
        })
      }
    })

    this.logger.log('RabbitMQ consumer ready')
  }

  private async recreateChannel(): Promise<void> {
    for (let attempt = 1; attempt <= MAX_CHANNEL_RETRIES; attempt++) {
      try {
        await this.setupChannel()
        return
      } catch (err) {
        const delay = Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), MAX_DELAY_MS)
        this.logger.warn({ attempt, delay }, 'channel recreate failed — retrying')
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
    this.logger.error('exhausted channel recreate attempts')
  }
}
