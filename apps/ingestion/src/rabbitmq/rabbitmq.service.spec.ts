import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ConfigService } from '@nestjs/config'
import { PinoLogger } from 'nestjs-pino'
import { RabbitMQService } from './rabbitmq.service'
import * as amqplib from 'amqplib'

const mockLogger = {
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as PinoLogger

vi.mock('amqplib')

const makeChannel = () => ({
  assertExchange: vi.fn().mockResolvedValue(undefined),
  publish: vi.fn().mockImplementation((_ex, _rk, _buf, _opts, cb) => cb(null)),
  close: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
})

const makeConnection = (channel: ReturnType<typeof makeChannel>) => ({
  createConfirmChannel: vi.fn().mockResolvedValue(channel),
  close: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
})

const makeConfig = (url = 'amqp://localhost') =>
  ({ get: vi.fn().mockReturnValue(url) }) as unknown as ConfigService

describe('RabbitMQService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('connects and checks exchange on init', async () => {
    const channel = makeChannel()
    const connection = makeConnection(channel)
    vi.mocked(amqplib.connect).mockResolvedValue(connection as any)

    const service = new RabbitMQService(makeConfig(), mockLogger)
    await service.onModuleInit()

    expect(amqplib.connect).toHaveBeenCalledWith('amqp://localhost')
    expect(channel.assertExchange).toHaveBeenCalledWith('flowmesh.events', 'topic', { durable: true })
  })

  it('publishes message with correct exchange and options', async () => {
    const channel = makeChannel()
    const connection = makeConnection(channel)
    vi.mocked(amqplib.connect).mockResolvedValue(connection as any)

    const service = new RabbitMQService(makeConfig(), mockLogger)
    await service.onModuleInit()
    await service.publish({ meta: {}, payload: {} })

    expect(channel.publish).toHaveBeenCalledOnce()
    const [exchange, routingKey, , options] = channel.publish.mock.calls[0]
    expect(exchange).toBe('flowmesh.events')
    expect(routingKey).toBe('event.ingested')
    expect(options.persistent).toBe(true)
    expect(options.contentType).toBe('application/json')
  })

  it('retries connection with backoff when RabbitMQ is unavailable', async () => {
    const channel = makeChannel()
    const connection = makeConnection(channel)
    vi.mocked(amqplib.connect)
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValue(connection as any)

    const service = new RabbitMQService(makeConfig(), mockLogger)
    const initPromise = service.onModuleInit()

    await vi.runAllTimersAsync()
    await initPromise

    expect(amqplib.connect).toHaveBeenCalledTimes(3)
  })

  it('reconnects automatically when connection closes unexpectedly', async () => {
    const channel = makeChannel()
    const connection = makeConnection(channel)
    vi.mocked(amqplib.connect).mockResolvedValue(connection as any)

    const service = new RabbitMQService(makeConfig(), mockLogger)
    await service.onModuleInit()

    const closeHandler = connection.on.mock.calls.find(([event]) => event === 'close')?.[1]
    expect(closeHandler).toBeDefined()

    // capture the reconnect promise before the handler discards it
    let reconnectResolve!: () => void
    const reconnectPromise = new Promise<void>((res) => { reconnectResolve = res })
    vi.mocked(amqplib.connect).mockImplementationOnce(async () => {
      reconnectResolve()
      return connection as any
    })

    closeHandler()
    await reconnectPromise

    expect(amqplib.connect).toHaveBeenCalledTimes(2)
  })

  it('does not reconnect when shutting down', async () => {
    const channel = makeChannel()
    const connection = makeConnection(channel)
    vi.mocked(amqplib.connect).mockResolvedValue(connection as any)

    const service = new RabbitMQService(makeConfig(), mockLogger)
    await service.onModuleInit()
    await service.onModuleDestroy()

    const closeHandler = connection.on.mock.calls.find(([event]) => event === 'close')?.[1]
    closeHandler?.()

    // give any async reconnect attempt a tick to start — none should
    await Promise.resolve()
    expect(amqplib.connect).toHaveBeenCalledTimes(1)
  })

  it('closes channel and connection cleanly on destroy', async () => {
    const channel = makeChannel()
    const connection = makeConnection(channel)
    vi.mocked(amqplib.connect).mockResolvedValue(connection as any)

    const service = new RabbitMQService(makeConfig(), mockLogger)
    await service.onModuleInit()
    await service.onModuleDestroy()

    expect(channel.close).toHaveBeenCalledOnce()
    expect(connection.close).toHaveBeenCalledOnce()
  })

  it('throws after max retry attempts are exhausted', async () => {
    vi.mocked(amqplib.connect).mockRejectedValue(new Error('ECONNREFUSED'))

    const service = new RabbitMQService(makeConfig(), mockLogger)
    const initPromise = service.onModuleInit()

    // attach rejection handler before running timers — prevents unhandled rejection
    // if the promise rejects during timer flush before we await it
    const assertion = expect(initPromise).rejects.toThrow('ECONNREFUSED')

    await vi.runAllTimersAsync()
    await assertion

    expect(amqplib.connect).toHaveBeenCalledTimes(11) // initial + 10 retries
  })

  it('recreates channel when channel closes unexpectedly', async () => {
    const channel = makeChannel()
    const connection = makeConnection(channel)
    vi.mocked(amqplib.connect).mockResolvedValue(connection as any)

    const service = new RabbitMQService(makeConfig(), mockLogger)
    await service.onModuleInit()

    const channelCloseHandler = channel.on.mock.calls.find(([event]) => event === 'close')?.[1]
    expect(channelCloseHandler).toBeDefined()

    let recreateResolve!: () => void
    const recreatePromise = new Promise<void>((res) => { recreateResolve = res })
    connection.createConfirmChannel.mockImplementationOnce(async () => {
      recreateResolve()
      return channel as any
    })

    channelCloseHandler!()
    await recreatePromise

    // createConfirmChannel called once on init, once on channel recreation
    expect(connection.createConfirmChannel).toHaveBeenCalledTimes(2)
  })

  it('does not recreate channel when shutting down', async () => {
    const channel = makeChannel()
    const connection = makeConnection(channel)
    vi.mocked(amqplib.connect).mockResolvedValue(connection as any)

    const service = new RabbitMQService(makeConfig(), mockLogger)
    await service.onModuleInit()
    await service.onModuleDestroy()

    const channelCloseHandler = channel.on.mock.calls.find(([event]) => event === 'close')?.[1]
    channelCloseHandler?.()

    await Promise.resolve()
    expect(connection.createConfirmChannel).toHaveBeenCalledTimes(1)
  })

  it('logs error when channel recreation fails', async () => {
    const channel = makeChannel()
    const connection = makeConnection(channel)
    vi.mocked(amqplib.connect).mockResolvedValue(connection as any)

    const service = new RabbitMQService(makeConfig(), mockLogger)
    await service.onModuleInit()

    const channelCloseHandler = channel.on.mock.calls.find(([event]) => event === 'close')?.[1]

    let errorResolve!: () => void
    const errorPromise = new Promise<void>((res) => { errorResolve = res })
    connection.createConfirmChannel.mockImplementationOnce(async () => {
      throw new Error('channel creation failed')
    })
    vi.mocked(mockLogger.error).mockImplementationOnce(() => { errorResolve() })

    channelCloseHandler!()
    await errorPromise

    expect(mockLogger.error).toHaveBeenCalled()
  })
})
