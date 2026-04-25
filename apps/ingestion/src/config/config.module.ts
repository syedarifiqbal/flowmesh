import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import Joi from 'joi'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
        PORT: Joi.number().default(3001),
        DATABASE_URL: Joi.string().required(),
        RABBITMQ_URL: Joi.string().required(),
        REDIS_PERSISTENT_URL: Joi.string().required(),
        REDIS_EPHEMERAL_URL: Joi.string().required(),
      }),
      validationOptions: {
        abortEarly: false,
      },
    }),
  ],
})
export class AppConfigModule {}
