import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common'
import { RabbitMqConnection } from '@flowmesh/nestjs-common'
import { FlowMeshEvent } from '@flowmesh/shared-types'
import { ConfirmChannel } from 'amqplib'
import { v5 as uuidv5 } from 'uuid'

const DELIVERY_EXCHANGE = 'pipeline.events'
const ROUTING_KEY = 'delivery.event'
const MAX_CHANNEL_RETRIES = 10
const BASE_DELAY_MS = 1000
const MAX_DELAY_MS = 30000

// Fixed namespace UUID for deterministic fan-out message ID generation.
// UUIDv5(namespace, executionId + destinationId) guarantees the same messageId
// on replay, enabling the delivery service to deduplicate.
const FANOUT_NAMESPACE = '7b3f7a1a-8e4c-4b3d-9f2e-1a2b3c4d5e6f'

export interface FanoutMessage {
  meta: {
    messageId: string
    executionId: string
    destinationId: string
  }
  event: FlowMeshEvent
}

@Injectable()
export class FanoutService implements OnModuleInit, OnModuleDestroy {
  private channel!: ConfirmChannel
  private shuttingDown = false
  private readonly logger = new Logger(FanoutService.name)

  constructor(private readonly connection: RabbitMqConnection) {}

  async onModuleInit() {
    await this.setupChannel()
  }

  async onModuleDestroy() {
    this.shuttingDown = true
    try {
      await this.channel?.close()
    } catch {
      // ignore on shutdown
    }
  }

  async publishToDestination(
    executionId: string,
    destinationId: string,
    event: FlowMeshEvent,
  ): Promise<void> {
    const messageId = uuidv5(`${executionId}:${destinationId}`, FANOUT_NAMESPACE)

    const message: FanoutMessage = {
      meta: { messageId, executionId, destinationId },
      event,
    }

    const content = Buffer.from(JSON.stringify(message))

    await new Promise<void>((resolve, reject) => {
      this.channel.publish(
        DELIVERY_EXCHANGE,
        ROUTING_KEY,
        content,
        {
          persistent: true,
          contentType: 'application/json',
          contentEncoding: 'utf-8',
          messageId,
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
    await this.channel.assertExchange(DELIVERY_EXCHANGE, 'topic', { durable: true })

    this.channel.on('close', () => {
      if (!this.shuttingDown) {
        this.logger.warn('fanout channel closed — recreating...')
        this.recreateChannel().catch((err: Error) => {
          this.logger.error(`fanout channel recreation failed permanently: ${err.message}`)
        })
      }
    })

    this.logger.log('fanout channel ready')
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
