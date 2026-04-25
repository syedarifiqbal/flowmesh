import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Logger } from 'nestjs-pino'
import { AppModule } from './app.module'
import { HttpExceptionFilter } from './common/filters/http-exception.filter'

// Give the load balancer time to drain connections before NestJS closes the server.
// Kubernetes sends SIGTERM then waits up to terminationGracePeriodSeconds before SIGKILL.
// Without this delay, in-flight requests routed to the pod after SIGTERM get connection errors.
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

  // SIGTERM: Kubernetes pod stop. Drain first so the load balancer stops routing
  // new requests before we close, then let NestJS call every onModuleDestroy().
  process.on('SIGTERM', async () => {
    logger.log('SIGTERM received — draining connections', 'Ingestion')
    await new Promise((resolve) => setTimeout(resolve, DRAIN_DELAY_MS))
    await app.close()
  })

  // SIGINT: local Ctrl-C. No drain needed — close immediately.
  process.on('SIGINT', async () => {
    await app.close()
  })

  const port = config.get<number>('PORT')!
  await app.listen(port, '0.0.0.0')
  app.get(Logger).log(`Ingestion service listening on port ${port}`, 'Ingestion')
}

bootstrap()
