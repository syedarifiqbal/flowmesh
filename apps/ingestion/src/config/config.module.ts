import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { appConfigValidationSchema } from './validation.schema'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: appConfigValidationSchema,
      validationOptions: {
        abortEarly: false,
      },
    }),
  ],
})
export class AppConfigModule {}
