import { IsString, IsObject, IsIn, IsOptional } from 'class-validator'

const DESTINATION_TYPES = ['postgres', 'mysql', 'slack', 'discord', 'webhook', 's3', 'email', 'elasticsearch'] as const

export class UpdateDestinationDto {
  @IsString()
  @IsOptional()
  name?: string

  @IsIn(DESTINATION_TYPES)
  @IsOptional()
  type?: typeof DESTINATION_TYPES[number]

  @IsObject()
  @IsOptional()
  config?: Record<string, unknown>
}
