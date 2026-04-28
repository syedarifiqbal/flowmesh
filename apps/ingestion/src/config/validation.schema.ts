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
  PORT: Joi.number().default(3001),
  DATABASE_URL: postgresUrlWithSchema('ingestion'),
  RABBITMQ_URL: Joi.string().required(),
  REDIS_PERSISTENT_URL: Joi.string().required(),
})