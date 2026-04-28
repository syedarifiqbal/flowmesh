import { describe, expect, it } from 'vitest'
import { appConfigValidationSchema } from './validation.schema'

const makeEnv = () => ({
  NODE_ENV: 'test',
  PORT: 3001,
  DATABASE_URL: 'postgresql://flowmesh:test@localhost:5433/flowmesh?schema=ingestion',
  RABBITMQ_URL: 'amqp://flowmesh:test@localhost:5672/flowmesh',
  REDIS_PERSISTENT_URL: 'redis://localhost:6380',
})

describe('appConfigValidationSchema', () => {
  it('does not require REDIS_EPHEMERAL_URL for ingestion', () => {
    const { error, value } = appConfigValidationSchema.validate(makeEnv())

    expect(error).toBeUndefined()
    expect(value.REDIS_EPHEMERAL_URL).toBeUndefined()
  })

  it('still requires REDIS_PERSISTENT_URL for ingestion idempotency storage', () => {
    const { REDIS_PERSISTENT_URL: _unused, ...env } = makeEnv()
    const { error } = appConfigValidationSchema.validate(env)

    expect(error).toBeDefined()
    expect(error?.details.map((detail) => detail.path.join('.'))).toContain('REDIS_PERSISTENT_URL')
  })
})