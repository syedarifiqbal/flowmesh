import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as amqplib from 'amqplib'
import { RabbitMqConnection, RABBITMQ_OPTIONS, RabbitMqOptions } from './rabbitmq-connection.service'

vi.mock('amqplib')
vi.mock('@nestjs/common', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nestjs/common')>()
  return {
    ...actual,
    Logger: class {
      log = vi.fn()
      warn = vi.fn()
      error = vi.fn()
    },
  }
})

const makeConnection = () => ({
  close: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
  createChannel: vi.fn(),
  createConfirmChannel: vi.fn(),
})

const makeOptions = (overrides: Partial<RabbitMqOptions> = {}): RabbitMqOptions => ({
  url: 'amqp://localhost',
  maxRetries: 2,
  baseDelayMs: 10,
  maxDelayMs: 100,
  ...overrides,
})

const makeService = (opts?: Partial<RabbitMqOptions>) => {
  const options = makeOptions(opts)
  return new RabbitMqConnection(options)
}

describe('RabbitMqConnection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('connects on init and exposes the connection', async () => {
    const conn = makeConnection()
    vi.mocked(amqplib.connect).mockResolvedValue(conn as any)

    const service = makeService()
    await service.onModuleInit()

    expect(amqplib.connect).toHaveBeenCalledWith('amqp://localhost')
    expect(service.getConnection()).toBe(conn)
  })

  it('retries with backoff when connection fails', async () => {
    const conn = makeConnection()
    vi.mocked(amqplib.connect)
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValue(conn as any)

    const service = makeService()
    const initPromise = service.onModuleInit()
    await vi.runAllTimersAsync()
    await initPromise

    expect(amqplib.connect).toHaveBeenCalledTimes(3)
  })

  it('throws after max retries are exhausted', async () => {
    vi.mocked(amqplib.connect).mockRejectedValue(new Error('ECONNREFUSED'))

    const service = makeService()
    const initPromise = service.onModuleInit()
    const assertion = expect(initPromise).rejects.toThrow('ECONNREFUSED')
    await vi.runAllTimersAsync()
    await assertion

    expect(amqplib.connect).toHaveBeenCalledTimes(3) // initial + 2 retries
  })

  it('reconnects automatically when connection closes unexpectedly', async () => {
    const conn = makeConnection()
    vi.mocked(amqplib.connect).mockResolvedValue(conn as any)

    const service = makeService()
    await service.onModuleInit()

    let reconnectResolve!: () => void
    const reconnectPromise = new Promise<void>((res) => { reconnectResolve = res })
    vi.mocked(amqplib.connect).mockImplementationOnce(async () => {
      reconnectResolve()
      return conn as any
    })

    const closeHandler = conn.on.mock.calls.find(([e]) => e === 'close')?.[1]
    closeHandler()
    await reconnectPromise

    expect(amqplib.connect).toHaveBeenCalledTimes(2)
  })

  it('does not reconnect when shutting down', async () => {
    const conn = makeConnection()
    vi.mocked(amqplib.connect).mockResolvedValue(conn as any)

    const service = makeService()
    await service.onModuleInit()
    await service.onModuleDestroy()

    const closeHandler = conn.on.mock.calls.find(([e]) => e === 'close')?.[1]
    closeHandler?.()
    await Promise.resolve()

    expect(amqplib.connect).toHaveBeenCalledTimes(1)
  })

  it('closes connection cleanly on destroy', async () => {
    const conn = makeConnection()
    vi.mocked(amqplib.connect).mockResolvedValue(conn as any)

    const service = makeService()
    await service.onModuleInit()
    await service.onModuleDestroy()

    expect(conn.close).toHaveBeenCalledOnce()
  })

  it('injects RABBITMQ_OPTIONS token', () => {
    expect(RABBITMQ_OPTIONS).toBe('RABBITMQ_OPTIONS')
  })
})
