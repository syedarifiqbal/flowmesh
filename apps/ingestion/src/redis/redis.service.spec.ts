import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConfigService } from '@nestjs/config'
import { PinoLogger } from 'nestjs-pino'
import { RedisService } from './redis.service'
import Redis from 'ioredis'

vi.mock('ioredis')

const mockLogger = {
  info: vi.fn(),
  debug: vi.fn(),
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
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
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
    expect(mockLogger.info).toHaveBeenCalledWith('connected to redis (persistent)')
  })

  it('logs error on error event', () => {
    const service = new RedisService(makeConfig(), mockLogger)
    service.onModuleInit()

    mockInstance.emit('error', new Error('ECONNREFUSED'))
    expect(mockLogger.error).toHaveBeenCalled()
  })

  it('logs error when connection ends permanently', () => {
    const service = new RedisService(makeConfig(), mockLogger)
    service.onModuleInit()

    mockInstance.emit('end')
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('no more retries'),
    )
  })

  it('returns false when event has not been processed', async () => {
    mockInstance.get.mockResolvedValue(null)
    const service = new RedisService(makeConfig(), mockLogger)
    service.onModuleInit()

    const result = await service.isEventProcessed('evt-123')
    expect(result).toBe(false)
  })

  it('returns true when event has been processed', async () => {
    mockInstance.get.mockResolvedValue('1')
    const service = new RedisService(makeConfig(), mockLogger)
    service.onModuleInit()

    const result = await service.isEventProcessed('evt-123')
    expect(result).toBe(true)
  })

  it('sets key with 24h TTL when marking event processed', async () => {
    const service = new RedisService(makeConfig(), mockLogger)
    service.onModuleInit()

    await service.markEventProcessed('evt-456')
    expect(mockInstance.set).toHaveBeenCalledWith('idempotency:evt-456', '1', 'EX', 86400)
  })

  it('calls quit on destroy', async () => {
    const service = new RedisService(makeConfig(), mockLogger)
    service.onModuleInit()
    await service.onModuleDestroy()

    expect(mockInstance.quit).toHaveBeenCalledOnce()
  })
})
