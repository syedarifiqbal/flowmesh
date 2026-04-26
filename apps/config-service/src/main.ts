import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { Logger } from 'nestjs-pino'
import { AppModule } from './app.module'
import { HttpExceptionFilter } from './common/filters/http-exception.filter'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true })

  app.useLogger(app.get(Logger))
  app.useGlobalFilters(app.get(HttpExceptionFilter))
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))

  const port = process.env.PORT ?? 3002
  await app.listen(port)

  const logger = app.get(Logger)
  logger.log(`Config service listening on port ${port}`, 'Bootstrap')

  process.on('SIGTERM', async () => {
    logger.log('SIGTERM received — shutting down', 'Bootstrap')
    await new Promise((resolve) => setTimeout(resolve, 5000))
    await app.close()
  })

  process.on('SIGINT', async () => {
    await app.close()
  })
}

bootstrap()
