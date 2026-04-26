import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConfigService } from '@nestjs/config'
import { PinoLogger } from 'nestjs-pino'
import { RedisService } from './redis.service'
import Redis from 'ioredis'

vi.mock('ioredis')

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as PinoLogger

const makeConfig = (url = 'redis://localhost:6379') =>
  ({ get: vi.fn().mockReturnValue(url) }) as unknown as ConfigService

const makeRedisInstance = () => {
  const handlers: Record<string, ((...args: unknown[]) => void)[]> = {}
  const instance = {
    on: vi.fn().mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
      handlers[event] ??= []
      handlers[event].push(handler)
      return instance
    }),
    connect: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    quit: vi.fn().mockResolvedValue('OK'),
    emit: (event: string, ...args: unknown[]) => {
      handlers[event]?.forEach((h) => h(...args))
    },
  }
  return instance
}

describe('RedisService', () => {
  let mockInstance: ReturnType<typeof makeRedisInstance>

  beforeEach(() => {
    vi.clearAllMocks()
    mockInstance = makeRedisInstance()
    vi.mocked(Redis).mockImplementation(() => mockInstance as unknown as Redis)
  })

  const getRetryStrategy = (): ((n: number) => number | null) => {
    const calls = vi.mocked(Redis).mock.calls as unknown as [string, Record<string, unknown>][]
    return calls[0][1].retryStrategy as (n: number) => number | null
  }

  it('creates a redis client with retryStrategy on init', () => {
    const service = new RedisService(makeConfig(), mockLogger)
    service.onModuleInit()

    expect(Redis).toHaveBeenCalledOnce()
    expect(getRetryStrategy()).toBeTypeOf('function')
  })

  it('retryStrategy returns exponential delay for early attempts', () => {
    const service = new RedisService(makeConfig(), mockLogger)
    service.onModuleInit()

    const retry = getRetryStrategy()
    const delay1 = retry(1)
    const delay2 = retry(2)

    expect(delay1).toBeGreaterThan(0)
    expect(delay2).toBeGreaterThan(delay1!)
  })

  it('retryStrategy caps delay at MAX_DELAY_MS', () => {
    const service = new RedisService(makeConfig(), mockLogger)
    service.onModuleInit()

    const delay = getRetryStrategy()(8) as number
    expect(delay).toBeLessThanOrEqual(30000)
  })

  it('retryStrategy returns null after max attempts', () => {
    const service = new RedisService(makeConfig(), mockLogger)
    service.onModuleInit()

    const result = getRetryStrategy()(11)
    expect(result).toBeNull()
  })

  it('logs info on connect event', () => {
    const service = new RedisService(makeConfig(), mockLogger)
    service.onModuleInit()

    mockInstance.emit('connect')
    expect(mockLogger.info).toHaveBeenCalledWith('Connected to Redis (ephemeral)')
  })

  it('logs error on redis error event', () => {
    const service = new RedisService(makeConfig(), mockLogger)
    service.onModuleInit()

    mockInstance.emit('error', new Error('ECONNREFUSED'))
    expect(mockLogger.error).toHaveBeenCalled()
  })

  it('logs warn when connection closes', () => {
    const service = new RedisService(makeConfig(), mockLogger)
    service.onModuleInit()

    mockInstance.emit('end')
    expect(mockLogger.warn).toHaveBeenCalledWith('Redis connection closed')
  })

  it('get returns the value from redis', async () => {
    mockInstance.get.mockResolvedValue('{"id":"abc"}')
    const service = new RedisService(makeConfig(), mockLogger)
    service.onModuleInit()

    const result = await service.get('config:pipeline:ws:id')
    expect(result).toBe('{"id":"abc"}')
    expect(mockInstance.get).toHaveBeenCalledWith('config:pipeline:ws:id')
  })

  it('get returns null on cache miss', async () => {
    mockInstance.get.mockResolvedValue(null)
    const service = new RedisService(makeConfig(), mockLogger)
    service.onModuleInit()

    expect(await service.get('missing-key')).toBeNull()
  })

  it('set stores value with TTL', async () => {
    const service = new RedisService(makeConfig(), mockLogger)
    service.onModuleInit()

    await service.set('config:pipeline:ws:id', '{"id":"abc"}', 300)
    expect(mockInstance.set).toHaveBeenCalledWith('config:pipeline:ws:id', '{"id":"abc"}', 'EX', 300)
  })

  it('del removes one or more keys', async () => {
    const service = new RedisService(makeConfig(), mockLogger)
    service.onModuleInit()

    await service.del('key1', 'key2')
    expect(mockInstance.del).toHaveBeenCalledWith('key1', 'key2')
  })

  it('del is a no-op when called with no keys', async () => {
    const service = new RedisService(makeConfig(), mockLogger)
    service.onModuleInit()

    await service.del()
    expect(mockInstance.del).not.toHaveBeenCalled()
  })

  it('calls quit on destroy', async () => {
    const service = new RedisService(makeConfig(), mockLogger)
    service.onModuleInit()
    await service.onModuleDestroy()

    expect(mockInstance.quit).toHaveBeenCalledOnce()
  })
})
