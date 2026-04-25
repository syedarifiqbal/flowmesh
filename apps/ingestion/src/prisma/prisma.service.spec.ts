import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PinoLogger } from 'nestjs-pino'
import { PrismaService } from './prisma.service'

vi.mock('@prisma/client', () => {
  class PrismaClient {
    $connect = vi.fn().mockResolvedValue(undefined)
    $disconnect = vi.fn().mockResolvedValue(undefined)
  }
  return { PrismaClient }
})

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
