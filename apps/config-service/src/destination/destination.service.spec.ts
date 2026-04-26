import { describe, it, expect, vi, beforeEach } from 'vitest'
import { randomUUID, randomBytes } from 'crypto'
import { NotFoundException } from '@nestjs/common'
import { PinoLogger } from 'nestjs-pino'
import { DestinationService } from './destination.service'
import { PrismaService } from '../prisma/prisma.service'
import { EncryptionService } from '../encryption/encryption.service'
import { CreateDestinationDto } from './dto/create-destination.dto'

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as PinoLogger

const WORKSPACE_ID = randomUUID()

const makeDestination = (overrides = {}) => ({
  id: randomUUID(),
  workspaceId: WORKSPACE_ID,
  name: 'My Slack',
  type: 'slack',
  encryptedConfig: 'aabbcc',
  iv: randomBytes(12).toString('hex'),
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

const makeDto = (overrides: Partial<CreateDestinationDto> = {}): CreateDestinationDto => ({
  name: 'My Slack',
  type: 'slack',
  config: { webhookUrl: 'https://hooks.slack.com/services/xxx' },
  ...overrides,
})

describe('DestinationService', () => {
  let service: DestinationService
  let prisma: {
    destination: {
      create: ReturnType<typeof vi.fn>
      findMany: ReturnType<typeof vi.fn>
      findFirst: ReturnType<typeof vi.fn>
      update: ReturnType<typeof vi.fn>
      delete: ReturnType<typeof vi.fn>
    }
  }
  let encryption: {
    encrypt: ReturnType<typeof vi.fn>
    decrypt: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    prisma = {
      destination: {
        create: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    }
    encryption = {
      encrypt: vi.fn().mockReturnValue({ encrypted: 'enc', iv: 'ivhex' }),
      decrypt: vi.fn().mockReturnValue('{"webhookUrl":"https://example.com"}'),
    }
    service = new DestinationService(
      prisma as unknown as PrismaService,
      encryption as unknown as EncryptionService,
      mockLogger,
    )
  })

  describe('create', () => {
    it('encrypts config and persists destination', async () => {
      const created = makeDestination()
      prisma.destination.create.mockResolvedValue(created)

      const result = await service.create(WORKSPACE_ID, makeDto())

      expect(encryption.encrypt).toHaveBeenCalledOnce()
      expect(prisma.destination.create).toHaveBeenCalledOnce()
      expect(result.id).toBe(created.id)
    })

    it('strips encryptedConfig and iv from response', async () => {
      prisma.destination.create.mockResolvedValue(makeDestination())

      const result = await service.create(WORKSPACE_ID, makeDto())

      expect(result).not.toHaveProperty('encryptedConfig')
      expect(result).not.toHaveProperty('iv')
    })
  })

  describe('findAll', () => {
    it('returns all destinations without encrypted fields', async () => {
      prisma.destination.findMany.mockResolvedValue([makeDestination(), makeDestination()])

      const results = await service.findAll(WORKSPACE_ID)

      expect(results).toHaveLength(2)
      for (const r of results) {
        expect(r).not.toHaveProperty('encryptedConfig')
        expect(r).not.toHaveProperty('iv')
      }
    })
  })

  describe('findOne', () => {
    it('returns destination without encrypted fields', async () => {
      const dest = makeDestination()
      prisma.destination.findFirst.mockResolvedValue(dest)

      const result = await service.findOne(WORKSPACE_ID, dest.id)

      expect(result.id).toBe(dest.id)
      expect(result).not.toHaveProperty('encryptedConfig')
    })

    it('throws NotFoundException when destination does not exist', async () => {
      prisma.destination.findFirst.mockResolvedValue(null)

      await expect(service.findOne(WORKSPACE_ID, randomUUID())).rejects.toThrow(NotFoundException)
    })
  })

  describe('findOneWithConfig', () => {
    it('decrypts and returns config alongside public fields', async () => {
      const dest = makeDestination()
      prisma.destination.findFirst.mockResolvedValue(dest)

      const result = await service.findOneWithConfig(WORKSPACE_ID, dest.id)

      expect(encryption.decrypt).toHaveBeenCalledWith(dest.encryptedConfig, dest.iv)
      expect(result).toHaveProperty('config')
      expect(result).not.toHaveProperty('encryptedConfig')
    })

    it('throws NotFoundException when destination does not exist', async () => {
      prisma.destination.findFirst.mockResolvedValue(null)

      await expect(service.findOneWithConfig(WORKSPACE_ID, randomUUID())).rejects.toThrow(NotFoundException)
    })
  })

  describe('update', () => {
    it('re-encrypts config when config is supplied', async () => {
      const dest = makeDestination()
      prisma.destination.findFirst.mockResolvedValue(dest)
      prisma.destination.update.mockResolvedValue({ ...dest, name: 'Updated' })

      await service.update(WORKSPACE_ID, dest.id, { config: { token: 'new' } })

      expect(encryption.encrypt).toHaveBeenCalledOnce()
    })

    it('does not call encrypt when config is not in the update dto', async () => {
      const dest = makeDestination()
      prisma.destination.findFirst.mockResolvedValue(dest)
      prisma.destination.update.mockResolvedValue({ ...dest, name: 'Renamed' })

      await service.update(WORKSPACE_ID, dest.id, { name: 'Renamed' })

      expect(encryption.encrypt).not.toHaveBeenCalled()
    })

    it('throws NotFoundException when destination does not exist', async () => {
      prisma.destination.findFirst.mockResolvedValue(null)

      await expect(service.update(WORKSPACE_ID, randomUUID(), { name: 'X' })).rejects.toThrow(NotFoundException)
    })
  })

  describe('remove', () => {
    it('deletes destination', async () => {
      const dest = makeDestination()
      prisma.destination.findFirst.mockResolvedValue(dest)
      prisma.destination.delete.mockResolvedValue(undefined)

      await service.remove(WORKSPACE_ID, dest.id)

      expect(prisma.destination.delete).toHaveBeenCalledWith({ where: { id: dest.id } })
    })

    it('throws NotFoundException when destination does not exist', async () => {
      prisma.destination.findFirst.mockResolvedValue(null)

      await expect(service.remove(WORKSPACE_ID, randomUUID())).rejects.toThrow(NotFoundException)
    })
  })
})
