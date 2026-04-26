import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import Joi from 'joi'

const postgresUrlWithSchema = (expectedSchema: string) =>
  Joi.string().required().custom((value, helpers) => {
    try {
      const url = new URL(value)
      const schema = url.searchParams.get('schema')
      if (schema !== expectedSchema) {
        return helpers.error('any.invalid', {
          message: `DATABASE_URL must include ?schema=${expectedSchema}`,
        })
      }
      return value
    } catch {
      return helpers.error('any.invalid', { message: 'DATABASE_URL is not a valid URL' })
    }
  })

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        NODE_ENV:               Joi.string().valid('development', 'production', 'test').default('development'),
        PORT:                   Joi.number().default(3002),
        DATABASE_URL:           postgresUrlWithSchema('config'),
        REDIS_EPHEMERAL_URL:    Joi.string().required(),
        CONFIG_ENCRYPTION_KEY:  Joi.string().length(64).required(),
      }),
      validationOptions: { abortEarly: false },
    }),
  ],
})
export class AppConfigModule {}
