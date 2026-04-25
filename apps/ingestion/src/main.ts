import { NestFactory } from '@nestjs/core'
import { ValidationPipe, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  const config = app.get(ConfigService)
  const logger = new Logger('Ingestion')

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }))

  const port = config.get<number>('PORT')!
  await app.listen(port, '0.0.0.0')
  logger.log(`Ingestion service listening on port ${port}`)
}

bootstrap()
