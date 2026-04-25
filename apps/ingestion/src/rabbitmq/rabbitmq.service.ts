import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import amqplib, { ChannelModel, ConfirmChannel } from 'amqplib'

const EXCHANGE = 'flowmesh.events'
const ROUTING_KEY = 'event.ingested'

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQService.name)
  private connection!: ChannelModel
  private channel!: ConfirmChannel

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const url = this.config.get<string>('RABBITMQ_URL')!

    this.connection = await amqplib.connect(url)
    this.channel = await this.connection.createConfirmChannel()

    // Passive assert — queue must already exist from RabbitMQ definitions
    await this.channel.checkExchange(EXCHANGE)

    this.logger.log('Connected to RabbitMQ')
  }

  async onModuleDestroy() {
    await this.channel.close()
    await this.connection.close()
  }

  async publish(message: Record<string, unknown>): Promise<void> {
    const content = Buffer.from(JSON.stringify(message))

    await new Promise<void>((resolve, reject) => {
      this.channel.publish(
        EXCHANGE,
        ROUTING_KEY,
        content,
        {
          persistent: true,          // survive RabbitMQ restart
          contentType: 'application/json',
          contentEncoding: 'utf-8',
        },
        (err) => {
          if (err) reject(err)
          else resolve()
        },
      )
    })
  }
}
