import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FanoutService } from './fanout.service'
import { RabbitMqConnection } from '@flowmesh/nestjs-common'
import { FlowMeshEvent } from '@flowmesh/shared-types'

const makeEvent = (): FlowMeshEvent => ({
  event: 'order.created',
  correlationId: 'corr-123',
  eventId: 'evt-123',
  timestamp: '2024-01-01T00:00:00Z',
  source: 'api',
  version: '1.0',
  properties: { plan: 'pro' },
})

const makeChannel = () => ({
  assertExchange: vi.fn().mockResolvedValue(undefined),
  publish: vi.fn().mockImplementation((_ex, _rk, _buf, _opts, cb) => cb(null)),
  close: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
})

const makeConnection = (channel: ReturnType<typeof makeChannel>) => {
  const amqpConn = { createConfirmChannel: vi.fn().mockResolvedValue(channel) }
  return {
    conn: { getConnection: vi.fn().mockReturnValue(amqpConn) } as unknown as RabbitMqConnection,
    amqpConn,
  }
}

describe('FanoutService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('sets up confirm channel and asserts delivery exchange on init', async () => {
    const channel = makeChannel()
    const { conn, amqpConn } = makeConnection(channel)

    const service = new FanoutService(conn)
    await service.onModuleInit()

    expect(amqpConn.createConfirmChannel).toHaveBeenCalledOnce()
    expect(channel.assertExchange).toHaveBeenCalledWith('pipeline.events', 'topic', { durable: true })
  })

  it('publishes a message with correct exchange and routing key', async () => {
    const channel = makeChannel()
    const { conn } = makeConnection(channel)

    const service = new FanoutService(conn)
    await service.onModuleInit()
    await service.publishToDestination('exec-1', 'dest-1', makeEvent())

    expect(channel.publish).toHaveBeenCalledOnce()
    const [exchange, routingKey, , options] = channel.publish.mock.calls[0]
    expect(exchange).toBe('pipeline.events')
    expect(routingKey).toBe('delivery.event')
    expect(options.persistent).toBe(true)
    expect(options.contentType).toBe('application/json')
  })

  it('includes correct message body with meta and event', async () => {
    const channel = makeChannel()
    const { conn } = makeConnection(channel)
    const event = makeEvent()

    const service = new FanoutService(conn)
    await service.onModuleInit()
    await service.publishToDestination('exec-1', 'dest-1', event)

    const [, , buffer] = channel.publish.mock.calls[0]
    const body = JSON.parse((buffer as Buffer).toString()) as {
      meta: { executionId: string; destinationId: string; messageId: string }
      event: FlowMeshEvent
    }
    expect(body.meta.executionId).toBe('exec-1')
    expect(body.meta.destinationId).toBe('dest-1')
    expect(typeof body.meta.messageId).toBe('string')
    expect(body.event).toEqual(event)
  })

  it('produces deterministic messageIds for same executionId + destinationId', async () => {
    const channel = makeChannel()
    const { conn } = makeConnection(channel)

    const service = new FanoutService(conn)
    await service.onModuleInit()
    await service.publishToDestination('exec-1', 'dest-1', makeEvent())
    await service.publishToDestination('exec-1', 'dest-1', makeEvent())

    const id1 = JSON.parse((channel.publish.mock.calls[0][2] as Buffer).toString()) as { meta: { messageId: string } }
    const id2 = JSON.parse((channel.publish.mock.calls[1][2] as Buffer).toString()) as { meta: { messageId: string } }
    expect(id1.meta.messageId).toBe(id2.meta.messageId)
  })

  it('produces different messageIds for different destinationIds', async () => {
    const channel = makeChannel()
    const { conn } = makeConnection(channel)

    const service = new FanoutService(conn)
    await service.onModuleInit()
    await service.publishToDestination('exec-1', 'dest-1', makeEvent())
    await service.publishToDestination('exec-1', 'dest-2', makeEvent())

    const id1 = JSON.parse((channel.publish.mock.calls[0][2] as Buffer).toString()) as { meta: { messageId: string } }
    const id2 = JSON.parse((channel.publish.mock.calls[1][2] as Buffer).toString()) as { meta: { messageId: string } }
    expect(id1.meta.messageId).not.toBe(id2.meta.messageId)
  })

  it('rejects when broker nacks the publish', async () => {
    const channel = makeChannel()
    channel.publish.mockImplementation((_ex, _rk, _buf, _opts, cb) => cb(new Error('broker nack')))
    const { conn } = makeConnection(channel)

    const service = new FanoutService(conn)
    await service.onModuleInit()

    await expect(service.publishToDestination('exec-1', 'dest-1', makeEvent())).rejects.toThrow('broker nack')
  })

  it('closes channel gracefully on destroy', async () => {
    const channel = makeChannel()
    const { conn } = makeConnection(channel)

    const service = new FanoutService(conn)
    await service.onModuleInit()
    await service.onModuleDestroy()

    expect(channel.close).toHaveBeenCalledOnce()
  })
})
