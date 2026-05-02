import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Logger } from 'nestjs-pino'
import { AppModule } from './app.module'
import { HttpExceptionFilter } from '@flowmesh/nestjs-common'

const DRAIN_DELAY_MS = 5000

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true })
  const config = app.get(ConfigService)

  app.useLogger(app.get(Logger))
  app.useGlobalFilters(app.get(HttpExceptionFilter))
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }))

  const logger = app.get(Logger)

  process.on('SIGTERM', async () => {
    logger.log('SIGTERM received — draining connections', 'ApiGateway')
    await new Promise((resolve) => setTimeout(resolve, DRAIN_DELAY_MS))
    await app.close()
  })

  process.on('SIGINT', async () => {
    await app.close()
  })

  const port = config.get<number>('PORT')!
  await app.listen(port, '0.0.0.0')
  logger.log(`API Gateway listening on port ${port}`, 'ApiGateway')
}

bootstrap()
