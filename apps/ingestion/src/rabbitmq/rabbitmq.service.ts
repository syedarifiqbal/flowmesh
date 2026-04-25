import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import amqplib, { ChannelModel, ConfirmChannel } from 'amqplib'

const EXCHANGE = 'flowmesh.events'
const ROUTING_KEY = 'event.ingested'
const MAX_RETRIES = 10
const BASE_DELAY_MS = 1000
const MAX_DELAY_MS = 30000

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private connection!: ChannelModel
  private channel!: ConfirmChannel
  private shuttingDown = false

  constructor(
    private readonly config: ConfigService,
    @InjectPinoLogger(RabbitMQService.name) private readonly logger: PinoLogger,
  ) {}

  async onModuleInit() {
    await this.connect()
  }

  async onModuleDestroy() {
    this.shuttingDown = true
    try {
      await this.channel?.close()
      await this.connection?.close()
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

  private async connect(attempt = 0): Promise<void> {
    const url = this.config.get<string>('RABBITMQ_URL')!

    try {
      this.connection = await amqplib.connect(url)
      this.channel = await this.connection.createConfirmChannel()
      await this.channel.assertExchange(EXCHANGE, 'topic', { durable: true })

      this.connection.on('close', () => {
        if (!this.shuttingDown) {
          this.logger.warn('RabbitMQ connection closed — reconnecting...')
          this.connect().catch((err: Error) => {
            this.logger.error(`RabbitMQ reconnection failed permanently: ${err.message}`)
          })
        }
      })

      this.connection.on('error', (err: Error) => {
        if (!this.shuttingDown) {
          this.logger.error(`RabbitMQ connection error: ${err.message}`)
        }
      })

      this.channel.on('close', () => {
        if (!this.shuttingDown) {
          this.logger.warn('RabbitMQ channel closed — recreating...')
          this.recreateChannel().catch((err: Error) => {
            this.logger.error(`RabbitMQ channel recreation failed: ${err.message}`)
          })
        }
      })

      this.logger.info('Connected to RabbitMQ')
    } catch (err) {
      if (this.shuttingDown) return

      if (attempt >= MAX_RETRIES) {
        this.logger.error('RabbitMQ max reconnect attempts reached — giving up')
        throw err
      }

      const delay = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS)
      this.logger.warn(`RabbitMQ unavailable — retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`)
      await this.sleep(delay)
      await this.connect(attempt + 1)
    }
  }

  private async recreateChannel(): Promise<void> {
    try {
      this.channel = await this.connection.createConfirmChannel()
      await this.channel.assertExchange(EXCHANGE, 'topic', { durable: true })
      this.logger.info('RabbitMQ channel recreated')
    } catch (err) {
      this.logger.error(`Failed to recreate channel: ${(err as Error).message}`)
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
