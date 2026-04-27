import { DynamicModule, FactoryProvider, Module } from '@nestjs/common'
import { RabbitMqConnection, RABBITMQ_OPTIONS, RabbitMqOptions } from './rabbitmq-connection.service'

export interface RabbitMqAsyncOptions {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useFactory: (...args: any[]) => RabbitMqOptions | Promise<RabbitMqOptions>
  inject?: FactoryProvider['inject']
}

@Module({})
export class RabbitMqModule {
  /**
   * Register once in AppModule. Provides RabbitMqConnection globally —
   * all modules in the service can inject it without re-importing.
   *
   * @example
   * RabbitMqModule.forRootAsync({
   *   useFactory: (config: ConfigService) => ({ url: config.get('RABBITMQ_URL')! }),
   *   inject: [ConfigService],
   * })
   */
  static forRootAsync(options: RabbitMqAsyncOptions): DynamicModule {
    return {
      module: RabbitMqModule,
      global: true,
      providers: [
        {
          provide: RABBITMQ_OPTIONS,
          useFactory: options.useFactory,
          inject: options.inject ?? [],
        },
        RabbitMqConnection,
      ],
      exports: [RabbitMqConnection],
    }
  }
}
