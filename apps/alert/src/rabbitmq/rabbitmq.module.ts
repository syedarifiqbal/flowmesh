import { Module } from '@nestjs/common'
import { RabbitMQConsumerService } from './rabbitmq.service'
import { EvaluatorModule } from '../evaluator/evaluator.module'

@Module({
  imports: [EvaluatorModule],
  providers: [RabbitMQConsumerService],
})
export class RabbitMQModule {}
