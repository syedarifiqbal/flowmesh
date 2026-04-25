import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { PrismaClient } from '@prisma/client'

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(@InjectPinoLogger(PrismaService.name) private readonly logger: PinoLogger) {
    super()
  }

  async onModuleInit() {
    await this.$connect()
    this.logger.info('connected to database')
  }

  async onModuleDestroy() {
    await this.$disconnect()
  }
}
