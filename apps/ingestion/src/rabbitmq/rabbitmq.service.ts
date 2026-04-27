import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common'
import { RabbitMqConnection } from '@flowmesh/nestjs-common'
import { ConfirmChannel } from 'amqplib'

const EXCHANGE = 'flowmesh.events'
const ROUTING_KEY = 'event.ingested'
const MAX_CHANNEL_RETRIES = 10
const BASE_DELAY_MS = 1000
const MAX_DELAY_MS = 30000

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private channel!: ConfirmChannel
  private shuttingDown = false
  private readonly logger = new Logger(RabbitMQService.name)

  constructor(private readonly connection: RabbitMqConnection) {}

  async onModuleInit() {
    await this.setupChannel()
  }

  async onModuleDestroy() {
    this.shuttingDown = true
    try {
      await this.channel?.close()
    } catch {
      // ignore errors during shutdown
    }
  }

  async publish(message: Record<string, unknown>): Promise<void> {
    const content = Buffer.from(JSON.stringify(message))

    await new Promise<void>((resolve, reject) => {
      this.channel.publish(
        EXCHANGE,
        ROUTING_KEY,
        content,
        {
          persistent: true,
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

  private async setupChannel(): Promise<void> {
    const conn = this.connection.getConnection()
    this.channel = await conn.createConfirmChannel()
    await this.channel.assertExchange(EXCHANGE, 'topic', { durable: true })

    this.channel.on('close', () => {
      if (!this.shuttingDown) {
        this.logger.warn('RabbitMQ channel closed — recreating...')
        this.recreateChannel().catch((err: Error) => {
          this.logger.error(`RabbitMQ channel recreation failed permanently: ${err.message}`)
        })
      }
    })

    this.logger.log('RabbitMQ channel ready')
  }

  private async recreateChannel(attempt = 0): Promise<void> {
    try {
      await this.setupChannel()
    } catch (err) {
      if (this.shuttingDown) return
      if (attempt >= MAX_CHANNEL_RETRIES) throw err

      const delay = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS)
      await new Promise((resolve) => setTimeout(resolve, delay))
      await this.recreateChannel(attempt + 1)
    }
  }
}
