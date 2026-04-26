import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PrismaService } from './prisma.service'

vi.mock('../generated/prisma', () => {
  class PrismaClient {
    $connect = vi.fn().mockResolvedValue(undefined)
    $disconnect = vi.fn().mockResolvedValue(undefined)
  }
  return { PrismaClient }
})

describe('PrismaService', () => {
  let service: PrismaService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new PrismaService()
  })

  it('connects to the database on init', async () => {
    await service.onModuleInit()
    expect(service.$connect).toHaveBeenCalledOnce()
  })

  it('disconnects from the database on destroy', async () => {
    await service.onModuleDestroy()
    expect(service.$disconnect).toHaveBeenCalledOnce()
  })
})
