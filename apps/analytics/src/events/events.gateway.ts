import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets'
import { Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Server, Socket } from 'socket.io'
import * as jwt from 'jsonwebtoken'
import { RedisService } from '../redis/redis.service'

interface AccessTokenPayload {
  sub: string
  workspaceId: string
  type: string
}

const LIVE_EVENTS_PATTERN = 'flowmesh:live:*'

@WebSocketGateway({
  cors: { origin: '*', credentials: true },
  namespace: '/events',
})
export class EventsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server

  private readonly logger = new Logger(EventsGateway.name)

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  afterInit() {
    this.logger.log('WebSocket gateway initialised')
    this.startRedisSubscription()
  }

  private startRedisSubscription() {
    void this.redis.psubscribe(LIVE_EVENTS_PATTERN, (channel, message) => {
      // channel format: flowmesh:live:{workspaceId}
      const workspaceId = channel.split(':')[2]
      if (!workspaceId) return

      let event: unknown
      try {
        event = JSON.parse(message)
      } catch {
        return
      }

      // Emit to the workspace room — only clients that joined this workspace receive it
      this.server.to(`workspace:${workspaceId}`).emit('event', event)
    })
  }

  handleConnection(client: Socket) {
    const token =
      (client.handshake.auth as Record<string, string>)?.token ??
      client.handshake.headers?.authorization?.replace('Bearer ', '')

    if (!token) {
      this.logger.warn({ socketId: client.id }, 'ws connection rejected — no token')
      client.disconnect()
      return
    }

    try {
      const payload = jwt.verify(token, this.config.get<string>('JWT_SECRET')!) as AccessTokenPayload
      if (payload.type !== 'access') throw new Error('wrong token type')

      // Tag the socket with the workspaceId so subscribe message can use it
      client.data.workspaceId = payload.workspaceId
      this.logger.log({ socketId: client.id, workspaceId: payload.workspaceId }, 'ws client connected')
    } catch {
      this.logger.warn({ socketId: client.id }, 'ws connection rejected — invalid token')
      client.disconnect()
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log({ socketId: client.id }, 'ws client disconnected')
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(@ConnectedSocket() client: Socket, @MessageBody() _data: unknown) {
    const workspaceId = client.data.workspaceId as string | undefined
    if (!workspaceId) return

    void client.join(`workspace:${workspaceId}`)
    this.logger.log({ socketId: client.id, workspaceId }, 'client subscribed to workspace events')
  }
}
