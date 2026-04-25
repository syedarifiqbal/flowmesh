import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { INestApplication, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { randomUUID } from 'node:crypto'
import request from 'supertest'
import * as amqplib from 'amqplib'
import { AppModule } from '../app.module'
import { HttpExceptionFilter } from '../common/filters/http-exception.filter'
import { PrismaService } from '../prisma/prisma.service'

const WORKSPACE_ID = randomUUID()
const RABBITMQ_URL = process.env.RABBITMQ_URL ?? 'amqp://flowmesh:flowmesh_dev@localhost:5672/flowmesh'
const QUEUE = 'ingestion.events'

describe('Ingestion (integration)', () => {
  let app: INestApplication
  let prisma: PrismaService
  let amqpConnection: amqplib.ChannelModel
  let amqpChannel: amqplib.Channel

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = module.createNestApplication()
    app.useGlobalFilters(app.get(HttpExceptionFilter))
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
    await app.init()

    prisma = app.get(PrismaService)
    amqpConnection = await amqplib.connect(RABBITMQ_URL)
    amqpChannel = await amqpConnection.createChannel()

    // Declare full topology so tests work against a fresh CI RabbitMQ (no pre-loaded definitions)
    await amqpChannel.assertExchange('flowmesh.events', 'topic', { durable: true })
    await amqpChannel.assertQueue(QUEUE, { durable: true })
    await amqpChannel.bindQueue(QUEUE, 'flowmesh.events', 'event.#')
  })

  afterEach(async () => {
    // remove test events so re-runs stay clean
    await prisma.event.deleteMany({ where: { source: 'integration-test' } })
  })

  afterAll(async () => {
    try { await amqpChannel.close() } catch { /* already closed */ }
    try { await amqpConnection.close() } catch { /* already closed */ }
    await app.close()
  })

  it('POST /events → 202 with eventId and accepted status', async () => {
    const { body } = await request(app.getHttpServer())
      .post('/events')
      .set('x-workspace-id', WORKSPACE_ID)
      .send({
        event: 'order.created',
        correlationId: randomUUID(),
        source: 'integration-test',
        version: '1.0',
        userId: 'user_123',
        properties: { orderId: 'ord_456', amount: 99.99 },
      })
      .expect(202)

    expect(body.status).toBe('accepted')
    expect(body.eventId).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('POST /events → event row written to postgres with correct fields', async () => {
    const correlationId = randomUUID()

    const { body } = await request(app.getHttpServer())
      .post('/events')
      .set('x-workspace-id', WORKSPACE_ID)
      .send({
        event: 'page.viewed',
        correlationId,
        source: 'integration-test',
        version: '1.0',
        userId: 'user_abc',
        properties: { page: '/dashboard' },
      })
      .expect(202)

    const row = await prisma.event.findUnique({ where: { eventId: body.eventId } })

    expect(row).not.toBeNull()
    expect(row!.workspaceId).toBe(WORKSPACE_ID)
    expect(row!.eventName).toBe('page.viewed')
    expect(row!.correlationId).toBe(correlationId)
    expect(row!.source).toBe('integration-test')
    expect(row!.userId).toBe('user_abc')
  })

  it('POST /events → message published to rabbitmq ingestion queue', async () => {
    const queueBefore = await amqpChannel.assertQueue(QUEUE, { durable: true })
    const depthBefore = queueBefore.messageCount

    await request(app.getHttpServer())
      .post('/events')
      .set('x-workspace-id', WORKSPACE_ID)
      .send({
        event: 'checkout.completed',
        correlationId: randomUUID(),
        source: 'integration-test',
        version: '1.0',
        userId: 'user_xyz',
        properties: { total: 149.99 },
      })
      .expect(202)

    const queueAfter = await amqpChannel.assertQueue(QUEUE, { durable: true })
    expect(queueAfter.messageCount).toBe(depthBefore + 1)
  })

  it('POST /events → second request with same eventId returns duplicate status', async () => {
    const eventId = randomUUID()
    const payload = {
      eventId,
      event: 'button.clicked',
      correlationId: randomUUID(),
      source: 'integration-test',
      version: '1.0',
      anonymousId: 'anon_test',
    }

    const first = await request(app.getHttpServer())
      .post('/events')
      .set('x-workspace-id', WORKSPACE_ID)
      .send(payload)
      .expect(202)

    expect(first.body.status).toBe('accepted')

    const second = await request(app.getHttpServer())
      .post('/events')
      .set('x-workspace-id', WORKSPACE_ID)
      .send(payload)
      .expect(202)

    expect(second.body.status).toBe('duplicate')
    expect(second.body.eventId).toBe(eventId)
  })

  it('POST /events → missing x-workspace-id returns 400', async () => {
    const { body } = await request(app.getHttpServer())
      .post('/events')
      .send({
        event: 'test.event',
        correlationId: randomUUID(),
        source: 'integration-test',
        version: '1.0',
      })
      .expect(400)

    expect(body.statusCode).toBe(400)
  })

  it('POST /events → invalid correlationId returns 400 with validation detail', async () => {
    const { body } = await request(app.getHttpServer())
      .post('/events')
      .set('x-workspace-id', WORKSPACE_ID)
      .send({
        event: 'test.event',
        correlationId: 'not-a-uuid',
        source: 'integration-test',
        version: '1.0',
      })
      .expect(400)

    expect(body.statusCode).toBe(400)
    expect(body.message).toEqual(expect.arrayContaining([expect.stringContaining('correlationId')]))
  })

  it('POST /events/batch → processes multiple events and returns results', async () => {
    const { body } = await request(app.getHttpServer())
      .post('/events/batch')
      .set('x-workspace-id', WORKSPACE_ID)
      .send({
        events: [
          { event: 'item.added', correlationId: randomUUID(), source: 'integration-test', version: '1.0', anonymousId: 'anon_1' },
          { event: 'item.removed', correlationId: randomUUID(), source: 'integration-test', version: '1.0', anonymousId: 'anon_2' },
        ],
      })
      .expect(202)

    expect(body.accepted).toBe(2)
    expect(body.duplicates).toBe(0)
    expect(body.results).toHaveLength(2)
    expect(body.results.every((r: { status: string }) => r.status === 'accepted')).toBe(true)
  })
})
