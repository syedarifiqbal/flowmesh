import { IsString, IsObject, IsIn } from 'class-validator'

const DESTINATION_TYPES = ['postgres', 'mysql', 'slack', 'discord', 'webhook', 's3', 'email', 'elasticsearch'] as const

export class CreateDestinationDto {
  @IsString()
  name!: string

  @IsIn(DESTINATION_TYPES)
  type!: typeof DESTINATION_TYPES[number]

  @IsObject()
  config!: Record<string, unknown>
}
