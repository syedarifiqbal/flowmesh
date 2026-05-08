import { describe, expect, it } from 'vitest'
import { appConfigValidationSchema } from './validation.schema'

const makeEnv = () => ({
  NODE_ENV: 'test',
  PORT: 3001,
  DATABASE_URL: 'postgresql://flowmesh:test@localhost:5433/flowmesh?schema=ingestion',
  RABBITMQ_URL: 'amqp://flowmesh:test@localhost:5672/flowmesh',
  REDIS_PERSISTENT_URL: 'redis://localhost:6380',
  REDIS_EPHEMERAL_URL: 'redis://localhost:6379',
})

describe('appConfigValidationSchema', () => {
  it('accepts a valid ingestion config', () => {
    const { error } = appConfigValidationSchema.validate(makeEnv())
    expect(error).toBeUndefined()
  })

  it('requires REDIS_EPHEMERAL_URL for live event pub/sub', () => {
    const { REDIS_EPHEMERAL_URL: _unused, ...env } = makeEnv()
    const { error } = appConfigValidationSchema.validate(env)

    expect(error).toBeDefined()
    expect(error?.details.map((detail) => detail.path.join('.'))).toContain('REDIS_EPHEMERAL_URL')
  })

  it('requires REDIS_PERSISTENT_URL for idempotency storage', () => {
    const { REDIS_PERSISTENT_URL: _unused, ...env } = makeEnv()
    const { error } = appConfigValidationSchema.validate(env)

    expect(error).toBeDefined()
    expect(error?.details.map((detail) => detail.path.join('.'))).toContain('REDIS_PERSISTENT_URL')
  })
})
