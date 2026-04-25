import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common'
import amqplib, { ChannelModel, ConfirmChannel } from 'amqplib'

const EXCHANGE = 'flowmesh.events'
const ROUTING_KEY = 'event.ingested'

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQService.name)
  private connection!: ChannelModel
  private channel!: ConfirmChannel

  async onModuleInit() {
    const url = process.env.RABBITMQ_URL
    if (!url) throw new Error('RABBITMQ_URL is required')

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
