import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
        PORT: Joi.number().default(3003),
        DATABASE_URL: postgresUrlWithSchema('pipeline'),
        RABBITMQ_URL: Joi.string().required(),
        REDIS_EPHEMERAL_URL: Joi.string().required(),
        REDIS_PERSISTENT_URL: Joi.string().required(),
        CONFIG_SERVICE_URL: Joi.string().required(),
      }),
      validationOptions: {
        abortEarly: false,
      },
    }),
  ],
})
export class AppConfigModule {}
