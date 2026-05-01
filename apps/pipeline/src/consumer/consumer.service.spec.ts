import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConsumerService } from './consumer.service'
import { RabbitMqConnection } from '@flowmesh/nestjs-common'
import { Pipeline } from '@flowmesh/shared-types'
import { FilterStepExecutor } from '../steps/filter/filter-step.executor'
import { TransformStepExecutor } from '../steps/transform/transform-step.executor'
import { EnrichStepExecutor } from '../steps/enrich/enrich-step.executor'
import { FanoutService } from '../fanout/fanout.service'
import { ConsumeMessage } from 'amqplib'

const WORKSPACE_ID = 'ws-1'
const MESSAGE_ID = 'msg-1'
const EVENT_ID = 'evt-1'

const makeQueueMessage = (overrides: Partial<{ event: string; workspaceId: string; messageId: string }> = {}) => ({
  meta: {
    messageId: overrides.messageId ?? MESSAGE_ID,
    correlationId: 'corr-1',
    timestamp: '2024-01-01T00:00:00Z',
    source: 'ingestion',
    version: '1.0',
    workspaceId: overrides.workspaceId ?? WORKSPACE_ID,
  },
  payload: {
    eventId: EVENT_ID,
    event: overrides.event ?? 'order.created',
    source: 'api',
    version: '1.0',
    properties: { plan: 'pro' },
    context: {},
    receivedAt: '2024-01-01T00:00:00Z',
  },
})

const makeAmqpMessage = (body: object): ConsumeMessage =>
  ({
    content: Buffer.from(JSON.stringify(body)),
    fields: {},
    properties: {},
  }) as unknown as ConsumeMessage

const makePipeline = (overrides: Partial<Pipeline> = {}): Pipeline => ({
  id: 'pipe-1',
  workspaceId: WORKSPACE_ID,
  name: 'Test Pipeline',
  trigger: { type: 'event', events: ['order.created'] },
  steps: [
    { id: 'step-dest-1', type: 'destination', name: 'Slack', config: { destinationId: 'dest-1' } },
  ],
  enabled: true,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  ...overrides,
})

const makeChannel = () => ({
  assertExchange: vi.fn().mockResolvedValue(undefined),
  assertQueue: vi.fn().mockResolvedValue(undefined),
  bindQueue: vi.fn().mockResolvedValue(undefined),
  prefetch: vi.fn(),
  consume: vi.fn().mockResolvedValue(undefined),
  ack: vi.fn(),
  nack: vi.fn(),
  close: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
})

const makePrisma = () => ({
  pipelineExecution: {
    create: vi.fn().mockResolvedValue({ id: 'exec-1' }),
    update: vi.fn().mockResolvedValue({}),
  },
})

const makeRedis = () => ({
  isMessageProcessed: vi.fn().mockResolvedValue(false),
  markMessageProcessed: vi.fn().mockResolvedValue(undefined),
})

const makeConfigClient = (pipelines: Pipeline[]) => ({
  getPipelinesForWorkspace: vi.fn().mockResolvedValue(pipelines),
})

const makeFanout = () => ({
  publishToDestination: vi.fn().mockResolvedValue(undefined),
})

function buildService(
  channel: ReturnType<typeof makeChannel>,
  prisma: ReturnType<typeof makePrisma>,
  redis: ReturnType<typeof makeRedis>,
  configClient: ReturnType<typeof makeConfigClient>,
  fanout: ReturnType<typeof makeFanout>,
) {
  const amqpConn = { createChannel: vi.fn().mockResolvedValue(channel) }
  const conn = { getConnection: vi.fn().mockReturnValue(amqpConn) } as unknown as RabbitMqConnection

  return new ConsumerService(
    conn,
    prisma as never,
    redis as never,
    configClient as never,
    new FilterStepExecutor(),
    new TransformStepExecutor(),
    new EnrichStepExecutor(),
    fanout as never,
  )
}

describe('ConsumerService', () => {
  let channel: ReturnType<typeof makeChannel>
  let prisma: ReturnType<typeof makePrisma>
  let redis: ReturnType<typeof makeRedis>
  let fanout: ReturnType<typeof makeFanout>

  beforeEach(() => {
    vi.clearAllMocks()
    channel = makeChannel()
    prisma = makePrisma()
    redis = makeRedis()
    fanout = makeFanout()
  })

  it('sets up exchanges, queue, binding, and starts consuming on init', async () => {
    const service = buildService(channel, prisma, redis, makeConfigClient([]), fanout)
    await service.onModuleInit()

    expect(channel.assertExchange).toHaveBeenCalledWith('flowmesh.dlq', 'topic', { durable: true })
    expect(channel.assertQueue).toHaveBeenCalledWith('pipeline.queue', expect.objectContaining({
      durable: true,
      arguments: expect.objectContaining({ 'x-dead-letter-exchange': 'flowmesh.dlq' }),
    }))
    expect(channel.bindQueue).toHaveBeenCalledWith('pipeline.queue', 'flowmesh.events', 'event.ingested')
    expect(channel.consume).toHaveBeenCalledWith('pipeline.queue', expect.any(Function))
  })

  it('acks duplicate messages without processing', async () => {
    redis.isMessageProcessed.mockResolvedValue(true)
    const service = buildService(channel, prisma, redis, makeConfigClient([makePipeline()]), fanout)
    await service.onModuleInit()

    const handler = channel.consume.mock.calls[0][1] as (msg: ConsumeMessage) => Promise<void>
    await handler(makeAmqpMessage(makeQueueMessage()))

    expect(channel.ack).toHaveBeenCalledOnce()
    expect(prisma.pipelineExecution.create).not.toHaveBeenCalled()
    expect(fanout.publishToDestination).not.toHaveBeenCalled()
  })

  it('acks cleanly when no pipelines match the event', async () => {
    const service = buildService(channel, prisma, redis, makeConfigClient([]), fanout)
    await service.onModuleInit()

    const handler = channel.consume.mock.calls[0][1] as (msg: ConsumeMessage) => Promise<void>
    await handler(makeAmqpMessage(makeQueueMessage()))

    expect(channel.ack).toHaveBeenCalledOnce()
    expect(prisma.pipelineExecution.create).not.toHaveBeenCalled()
  })

  it('acks cleanly when event does not match pipeline trigger', async () => {
    const service = buildService(
      channel, prisma, redis,
      makeConfigClient([makePipeline({ trigger: { type: 'event', events: ['user.signed_up'] } })]),
      fanout,
    )
    await service.onModuleInit()

    const handler = channel.consume.mock.calls[0][1] as (msg: ConsumeMessage) => Promise<void>
    await handler(makeAmqpMessage(makeQueueMessage()))

    expect(channel.ack).toHaveBeenCalledOnce()
    expect(prisma.pipelineExecution.create).not.toHaveBeenCalled()
  })

  it('runs happy path: creates execution, fans out, marks processed, acks', async () => {
    const service = buildService(channel, prisma, redis, makeConfigClient([makePipeline()]), fanout)
    await service.onModuleInit()

    const handler = channel.consume.mock.calls[0][1] as (msg: ConsumeMessage) => Promise<void>
    await handler(makeAmqpMessage(makeQueueMessage()))

    expect(prisma.pipelineExecution.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'running', pipelineId: 'pipe-1' }),
    }))
    expect(fanout.publishToDestination).toHaveBeenCalledWith('exec-1', 'dest-1', expect.objectContaining({ eventId: EVENT_ID }))
    expect(prisma.pipelineExecution.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'completed' }),
    }))
    expect(redis.markMessageProcessed).toHaveBeenCalledWith(MESSAGE_ID)
    expect(channel.ack).toHaveBeenCalledOnce()
    expect(channel.nack).not.toHaveBeenCalled()
  })

  it('skips execution record when filter step drops the event', async () => {
    const pipeline = makePipeline({
      steps: [
        { id: 'filter-1', type: 'filter', name: 'Filter', config: { conditions: [{ field: 'event', operator: 'equals', value: 'user.signed_up' }], logic: 'AND' } },
        { id: 'dest-1', type: 'destination', name: 'Slack', config: { destinationId: 'dest-1' } },
      ],
    })
    const service = buildService(channel, prisma, redis, makeConfigClient([pipeline]), fanout)
    await service.onModuleInit()

    const handler = channel.consume.mock.calls[0][1] as (msg: ConsumeMessage) => Promise<void>
    await handler(makeAmqpMessage(makeQueueMessage()))

    expect(prisma.pipelineExecution.create).not.toHaveBeenCalled()
    expect(fanout.publishToDestination).not.toHaveBeenCalled()
    expect(channel.ack).toHaveBeenCalledOnce()
  })

  it('nacks to DLQ and marks execution failed when fanout throws', async () => {
    fanout.publishToDestination.mockRejectedValue(new Error('broker error'))
    const service = buildService(channel, prisma, redis, makeConfigClient([makePipeline()]), fanout)
    await service.onModuleInit()

    const handler = channel.consume.mock.calls[0][1] as (msg: ConsumeMessage) => Promise<void>
    await handler(makeAmqpMessage(makeQueueMessage()))

    expect(prisma.pipelineExecution.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'failed', error: 'broker error' }),
    }))
    expect(redis.markMessageProcessed).not.toHaveBeenCalled()
    expect(channel.nack).toHaveBeenCalledWith(expect.anything(), false, false)
    expect(channel.ack).not.toHaveBeenCalled()
  })

  it('nacks to DLQ when config-service call fails', async () => {
    const configClient = makeConfigClient([])
    configClient.getPipelinesForWorkspace.mockRejectedValue(new Error('circuit open'))
    const service = buildService(channel, prisma, redis, configClient, fanout)
    await service.onModuleInit()

    const handler = channel.consume.mock.calls[0][1] as (msg: ConsumeMessage) => Promise<void>
    await handler(makeAmqpMessage(makeQueueMessage()))

    expect(channel.nack).toHaveBeenCalledWith(expect.anything(), false, false)
    expect(channel.ack).not.toHaveBeenCalled()
  })

  it('nacks to DLQ when message content is not valid JSON', async () => {
    const service = buildService(channel, prisma, redis, makeConfigClient([makePipeline()]), fanout)
    await service.onModuleInit()

    const handler = channel.consume.mock.calls[0][1] as (msg: ConsumeMessage) => Promise<void>
    const badMsg = { content: Buffer.from('not-json'), fields: {}, properties: {} } as unknown as ConsumeMessage
    await handler(badMsg)

    expect(channel.nack).toHaveBeenCalledWith(expect.anything(), false, false)
  })

  it('fans out to multiple destinations in a pipeline', async () => {
    const pipeline = makePipeline({
      steps: [
        { id: 'dest-1', type: 'destination', name: 'Slack', config: { destinationId: 'dest-slack' } },
        { id: 'dest-2', type: 'destination', name: 'S3', config: { destinationId: 'dest-s3' } },
      ],
    })
    const service = buildService(channel, prisma, redis, makeConfigClient([pipeline]), fanout)
    await service.onModuleInit()

    const handler = channel.consume.mock.calls[0][1] as (msg: ConsumeMessage) => Promise<void>
    await handler(makeAmqpMessage(makeQueueMessage()))

    expect(fanout.publishToDestination).toHaveBeenCalledTimes(2)
    expect(fanout.publishToDestination).toHaveBeenCalledWith('exec-1', 'dest-slack', expect.anything())
    expect(fanout.publishToDestination).toHaveBeenCalledWith('exec-1', 'dest-s3', expect.anything())
  })
})
