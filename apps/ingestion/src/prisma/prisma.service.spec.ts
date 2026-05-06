import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PinoLogger } from 'nestjs-pino'
import { PrismaService } from './prisma.service'

const mockLogger = {
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as PinoLogger

describe('PrismaService', () => {
  let service: PrismaService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new PrismaService(mockLogger)
    vi.spyOn(service, '$connect').mockResolvedValue()
    vi.spyOn(service, '$disconnect').mockResolvedValue()
  })

  it('connects to the database on init', async () => {
    await service.onModuleInit()
    expect(service.$connect).toHaveBeenCalledOnce()
  })

  it('logs connected message after successful connect', async () => {
    await service.onModuleInit()
    expect(mockLogger.info).toHaveBeenCalledWith('connected to database')
  })

  it('disconnects from the database on destroy', async () => {
    await service.onModuleDestroy()
    expect(service.$disconnect).toHaveBeenCalledOnce()
  })
})
