import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RabbitMQService } from './rabbitmq.service'
import { RabbitMqConnection } from '@flowmesh/nestjs-common'

const makeChannel = () => ({
  assertExchange: vi.fn().mockResolvedValue(undefined),
  publish: vi.fn().mockImplementation((_ex, _rk, _buf, _opts, cb) => cb(null)),
  close: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
})

const makeAmqpConnection = (channel: ReturnType<typeof makeChannel>) => ({
  createConfirmChannel: vi.fn().mockResolvedValue(channel),
})

const makeConnection = (channel: ReturnType<typeof makeChannel>) => {
  const amqpConn = makeAmqpConnection(channel)
  return {
    rabbitMqConn: { getConnection: vi.fn().mockReturnValue(amqpConn) } as unknown as RabbitMqConnection,
    amqpConn,
  }
}

describe('RabbitMQService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('sets up channel and asserts exchange on init', async () => {
    const channel = makeChannel()
    const { rabbitMqConn, amqpConn } = makeConnection(channel)

    const service = new RabbitMQService(rabbitMqConn)
    await service.onModuleInit()

    expect(rabbitMqConn.getConnection).toHaveBeenCalled()
    expect(amqpConn.createConfirmChannel).toHaveBeenCalled()
    expect(channel.assertExchange).toHaveBeenCalledWith('flowmesh.events', 'topic', { durable: true })
  })

  it('publishes message with correct exchange and options', async () => {
    const channel = makeChannel()
    const { rabbitMqConn } = makeConnection(channel)

    const service = new RabbitMQService(rabbitMqConn)
    await service.onModuleInit()
    await service.publish({ meta: {}, payload: {} })

    expect(channel.publish).toHaveBeenCalledOnce()
    const [exchange, routingKey, , options] = channel.publish.mock.calls[0]
    expect(exchange).toBe('flowmesh.events')
    expect(routingKey).toBe('event.ingested')
    expect(options.persistent).toBe(true)
    expect(options.contentType).toBe('application/json')
  })

  it('closes channel on destroy', async () => {
    const channel = makeChannel()
    const { rabbitMqConn } = makeConnection(channel)

    const service = new RabbitMQService(rabbitMqConn)
    await service.onModuleInit()
    await service.onModuleDestroy()

    expect(channel.close).toHaveBeenCalledOnce()
  })

  it('recreates channel when channel closes unexpectedly', async () => {
    const channel = makeChannel()
    const { rabbitMqConn, amqpConn } = makeConnection(channel)

    const service = new RabbitMQService(rabbitMqConn)
    await service.onModuleInit()

    let recreateResolve!: () => void
    const recreatePromise = new Promise<void>((res) => { recreateResolve = res })
    amqpConn.createConfirmChannel.mockImplementationOnce(async () => {
      recreateResolve()
      return channel as any
    })

    const channelCloseHandler = channel.on.mock.calls.find(([event]) => event === 'close')?.[1]
    expect(channelCloseHandler).toBeDefined()
    channelCloseHandler!()
    await recreatePromise

    expect(amqpConn.createConfirmChannel).toHaveBeenCalledTimes(2)
  })

  it('does not recreate channel when shutting down', async () => {
    const channel = makeChannel()
    const { rabbitMqConn, amqpConn } = makeConnection(channel)

    const service = new RabbitMQService(rabbitMqConn)
    await service.onModuleInit()
    await service.onModuleDestroy()

    const channelCloseHandler = channel.on.mock.calls.find(([event]) => event === 'close')?.[1]
    channelCloseHandler?.()
    await Promise.resolve()

    expect(amqpConn.createConfirmChannel).toHaveBeenCalledTimes(1)
  })

  it('retries channel setup with backoff when recreation fails', async () => {
    const channel = makeChannel()
    const { rabbitMqConn, amqpConn } = makeConnection(channel)

    const service = new RabbitMQService(rabbitMqConn)
    await service.onModuleInit()

    amqpConn.createConfirmChannel
      .mockRejectedValueOnce(new Error('channel error'))
      .mockRejectedValueOnce(new Error('channel error'))
      .mockResolvedValue(channel as any)

    const channelCloseHandler = channel.on.mock.calls.find(([event]) => event === 'close')?.[1]
    const recreatePromise = new Promise<void>((res) => {
      channel.assertExchange.mockImplementationOnce(async () => { res() })
    })

    channelCloseHandler!()
    await vi.runAllTimersAsync()
    await recreatePromise

    expect(amqpConn.createConfirmChannel).toHaveBeenCalledTimes(4) // 1 init + 2 failures + 1 success
  })
})
