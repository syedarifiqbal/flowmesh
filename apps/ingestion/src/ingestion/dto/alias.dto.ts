import {
  IsString,
  IsNotEmpty,
  IsUUID,
  IsISO8601,
  IsOptional,
} from 'class-validator'

export class AliasDto {
  @IsString()
  @IsNotEmpty()
  userId!: string

  @IsString()
  @IsNotEmpty()
  anonymousId!: string

  @IsUUID('4')
  @IsOptional()
  correlationId?: string

  @IsUUID('4')
  @IsOptional()
  eventId?: string

  @IsISO8601({ strict: true })
  @IsOptional()
  timestamp?: string

  @IsString()
  @IsNotEmpty()
  source!: string

  @IsString()
  @IsNotEmpty()
  version!: string
}
