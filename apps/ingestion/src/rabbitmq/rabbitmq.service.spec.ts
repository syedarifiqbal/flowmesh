import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConfigService } from '@nestjs/config'
import { RabbitMQService } from './rabbitmq.service'
import * as amqplib from 'amqplib'

vi.mock('amqplib')

const makeChannel = () => ({
  checkExchange: vi.fn().mockResolvedValue(undefined),
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

    const service = new RabbitMQService(makeConfig())
    await service.onModuleInit()

    expect(amqplib.connect).toHaveBeenCalledWith('amqp://localhost')
    expect(channel.checkExchange).toHaveBeenCalledWith('flowmesh.events')
  })

  it('publishes message with correct exchange and options', async () => {
    const channel = makeChannel()
    const connection = makeConnection(channel)
    vi.mocked(amqplib.connect).mockResolvedValue(connection as any)

    const service = new RabbitMQService(makeConfig())
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

    const service = new RabbitMQService(makeConfig())
    const initPromise = service.onModuleInit()

    await vi.runAllTimersAsync()
    await initPromise

    expect(amqplib.connect).toHaveBeenCalledTimes(3)
  })

  it('reconnects automatically when connection closes unexpectedly', async () => {
    const channel = makeChannel()
    const connection = makeConnection(channel)
    vi.mocked(amqplib.connect).mockResolvedValue(connection as any)

    const service = new RabbitMQService(makeConfig())
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

    const service = new RabbitMQService(makeConfig())
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

    const service = new RabbitMQService(makeConfig())
    await service.onModuleInit()
    await service.onModuleDestroy()

    expect(channel.close).toHaveBeenCalledOnce()
    expect(connection.close).toHaveBeenCalledOnce()
  })

  it('throws after max retry attempts are exhausted', async () => {
    vi.mocked(amqplib.connect).mockRejectedValue(new Error('ECONNREFUSED'))

    const service = new RabbitMQService(makeConfig())
    const initPromise = service.onModuleInit()

    // attach rejection handler before running timers — prevents unhandled rejection
    // if the promise rejects during timer flush before we await it
    const assertion = expect(initPromise).rejects.toThrow('ECONNREFUSED')

    await vi.runAllTimersAsync()
    await assertion

    expect(amqplib.connect).toHaveBeenCalledTimes(11) // initial + 10 retries
  })
})
