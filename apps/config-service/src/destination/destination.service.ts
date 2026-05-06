import { Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { PrismaService } from '../prisma/prisma.service'
import { EncryptionService } from '../encryption/encryption.service'
import { CreateDestinationDto } from './dto/create-destination.dto'
import { UpdateDestinationDto } from './dto/update-destination.dto'

@Injectable()
export class DestinationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly config: ConfigService,
    @InjectPinoLogger(DestinationService.name) private readonly logger: PinoLogger,
  ) {}

  async create(workspaceId: string, dto: CreateDestinationDto) {
    const { encrypted, iv } = this.encryption.encrypt(JSON.stringify(dto.config))

    const destination = await this.prisma.destination.create({
      data: {
        workspaceId,
        name: dto.name,
        type: dto.type,
        encryptedConfig: encrypted,
        iv,
      },
    })

    this.logger.info({ destinationId: destination.id, workspaceId, type: dto.type }, 'Destination created')
    return this.toPublic(destination)
  }

  async findAll(workspaceId: string) {
    const destinations = await this.prisma.destination.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    })
    return destinations.map((d) => this.toPublic(d))
  }

  async findOne(workspaceId: string, id: string) {
    const destination = await this.prisma.destination.findFirst({
      where: { id, workspaceId },
    })
    if (!destination) throw new NotFoundException(`Destination ${id} not found`)
    return this.toPublic(destination)
  }

  async findOneWithConfig(workspaceId: string, id: string) {
    const destination = await this.prisma.destination.findFirst({
      where: { id, workspaceId },
    })
    if (!destination) throw new NotFoundException(`Destination ${id} not found`)

    const config = JSON.parse(this.encryption.decrypt(destination.encryptedConfig, destination.iv))
    return { ...this.toPublic(destination), config }
  }

  async update(workspaceId: string, id: string, dto: UpdateDestinationDto) {
    await this.assertExists(workspaceId, id)

    const updateData: Record<string, unknown> = {}
    if (dto.name !== undefined) updateData.name = dto.name
    if (dto.type !== undefined) updateData.type = dto.type
    if (dto.config !== undefined) {
      const { encrypted, iv } = this.encryption.encrypt(JSON.stringify(dto.config))
      updateData.encryptedConfig = encrypted
      updateData.iv = iv
      updateData.status = 'untested'
    }

    const destination = await this.prisma.destination.update({
      where: { id },
      data: updateData,
    })

    this.logger.info({ destinationId: id, workspaceId }, 'Destination updated')
    return this.toPublic(destination)
  }

  async testConnection(workspaceId: string, id: string): Promise<{ ok: boolean; error?: string }> {
    const destination = await this.prisma.destination.findFirst({ where: { id, workspaceId } })
    if (!destination) throw new NotFoundException(`Destination ${id} not found`)

    const config = JSON.parse(this.encryption.decrypt(destination.encryptedConfig, destination.iv))
    const deliveryUrl = this.config.get<string>('DELIVERY_SERVICE_URL')!

    let ok = false
    let error: string | undefined

    try {
      const res = await fetch(`${deliveryUrl}/internal/test-destination`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: destination.type, config }),
        signal: AbortSignal.timeout(15_000),
      })
      const body = await res.json() as { ok: boolean; error?: string }
      ok = body.ok
      error = body.error
    } catch (err) {
      error = err instanceof Error ? err.message : 'delivery service unreachable'
    }

    await this.prisma.destination.update({
      where: { id },
      data: { status: ok ? 'verified' : 'failed' },
    })

    this.logger.info({ destinationId: id, workspaceId, ok }, 'destination test completed')
    return { ok, error }
  }

  async remove(workspaceId: string, id: string) {
    await this.assertExists(workspaceId, id)
    await this.prisma.destination.delete({ where: { id } })
    this.logger.info({ destinationId: id, workspaceId }, 'Destination deleted')
  }

  private async assertExists(workspaceId: string, id: string) {
    const exists = await this.prisma.destination.findFirst({ where: { id, workspaceId } })
    if (!exists) throw new NotFoundException(`Destination ${id} not found`)
  }

  // never expose encrypted fields or iv in API responses
  private toPublic(destination: { id: string; workspaceId: string; name: string; type: string; status: string; createdAt: Date; updatedAt: Date }) {
    return {
      id: destination.id,
      workspaceId: destination.workspaceId,
      name: destination.name,
      type: destination.type,
      status: destination.status,
      createdAt: destination.createdAt,
      updatedAt: destination.updatedAt,
    }
  }
}
