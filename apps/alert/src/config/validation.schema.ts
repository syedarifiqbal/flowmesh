import Joi from 'joi'

const postgresUrlWithSchema = (expectedSchema: string) =>
  Joi.string()
    .required()
    .custom((value: string, helpers) => {
      try {
        const url = new URL(value)
        const schema = url.searchParams.get('schema')
        if (schema !== expectedSchema) {
          return helpers.error('any.invalid', {
            message: `DATABASE_URL must include ?schema=${expectedSchema} (got: ${schema ?? 'none'})`,
          })
        }
      } catch {
        return helpers.error('any.invalid', { message: 'DATABASE_URL is not a valid URL' })
      }
      return value
    })

export const appConfigValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3007),
  DATABASE_URL: postgresUrlWithSchema('alert'),
  RABBITMQ_URL: Joi.string().required(),
  REDIS_EPHEMERAL_URL: Joi.string().required(),
  SMTP_HOST: Joi.string().default(''),
  SMTP_PORT: Joi.number().default(587),
  SMTP_USER: Joi.string().default(''),
  SMTP_PASS: Joi.string().default(''),
  SMTP_FROM: Joi.string().default('alerts@flowmesh.io'),
})
