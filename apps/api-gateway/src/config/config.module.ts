import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import Joi from 'joi'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
        PORT: Joi.number().default(3000),
        REDIS_EPHEMERAL_URL: Joi.string().required(),
        REDIS_PERSISTENT_URL: Joi.string().required(),
        JWT_SECRET: Joi.string().required(),
        INGESTION_SERVICE_URL: Joi.string().required(),
        CONFIG_SERVICE_URL: Joi.string().required(),
        AUTH_SERVICE_URL: Joi.string().required(),
        RATE_LIMIT_INGEST_RPM: Joi.number().default(1000),
        RATE_LIMIT_MGMT_RPM: Joi.number().default(100),
      }),
      validationOptions: { abortEarly: false },
    }),
  ],
})
export class AppConfigModule {}
