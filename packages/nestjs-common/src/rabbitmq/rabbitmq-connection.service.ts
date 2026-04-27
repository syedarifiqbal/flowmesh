import { Injectable, OnModuleInit, OnModuleDestroy, Logger, Inject } from '@nestjs/common'
import amqplib, { ChannelModel } from 'amqplib'

export const RABBITMQ_OPTIONS = 'RABBITMQ_OPTIONS'

export interface RabbitMqOptions {
  url: string
  maxRetries?: number
  baseDelayMs?: number
  maxDelayMs?: number
}

@Injectable()
export class RabbitMqConnection implements OnModuleInit, OnModuleDestroy {
  private connection!: ChannelModel
  private shuttingDown = false
  private readonly logger = new Logger(RabbitMqConnection.name)

  private readonly maxRetries: number
  private readonly baseDelayMs: number
  private readonly maxDelayMs: number

  constructor(@Inject(RABBITMQ_OPTIONS) private readonly options: RabbitMqOptions) {
    this.maxRetries = options.maxRetries ?? 10
    this.baseDelayMs = options.baseDelayMs ?? 1000
    this.maxDelayMs = options.maxDelayMs ?? 30000
  }

  async onModuleInit() {
    await this.connect()
  }

  async onModuleDestroy() {
    this.shuttingDown = true
    try {
      await this.connection?.close()
    } catch {
      // ignore errors during shutdown
    }
  }

  /** Returns the live amqplib connection. Call createChannel() or createConfirmChannel() on it. */
  getConnection(): ChannelModel {
    return this.connection
  }

  private async connect(attempt = 0): Promise<void> {
    try {
      this.connection = await amqplib.connect(this.options.url)

      this.connection.on('close', () => {
        if (!this.shuttingDown) {
          this.logger.warn('RabbitMQ connection closed — reconnecting')
          this.connect().catch(() => {
            this.logger.error('RabbitMQ reconnection failed permanently')
          })
        }
      })

      this.connection.on('error', (err: Error) => {
        if (!this.shuttingDown) {
          this.logger.error(`RabbitMQ connection error: ${err.message}`)
        }
      })

      this.logger.log('connected to RabbitMQ')
    } catch (err) {
      if (this.shuttingDown) return

      if (attempt >= this.maxRetries) {
        this.logger.error('RabbitMQ max reconnect attempts reached — giving up')
        throw err
      }

      const delay = Math.min(this.baseDelayMs * 2 ** attempt, this.maxDelayMs)
      this.logger.warn(`RabbitMQ unavailable — retrying in ${delay}ms (attempt ${attempt + 1}/${this.maxRetries})`)
      await new Promise((resolve) => setTimeout(resolve, delay))
      await this.connect(attempt + 1)
    }
  }
}
