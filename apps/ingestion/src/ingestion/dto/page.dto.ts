import {
  IsString,
  IsNotEmpty,
  IsUrl,
  IsUUID,
  IsISO8601,
  IsOptional,
  IsObject,
} from 'class-validator'

export class PageDto {
  @IsString()
  @IsNotEmpty()
  name!: string

  @IsUrl({ require_tld: false })
  @IsOptional()
  url?: string

  @IsString()
  @IsNotEmpty()
  source!: string

  @IsString()
  @IsNotEmpty()
  version!: string

  @IsString()
  @IsOptional()
  userId?: string

  @IsString()
  @IsOptional()
  anonymousId?: string

  @IsString()
  @IsOptional()
  sessionId?: string

  @IsUUID('4')
  @IsOptional()
  correlationId?: string

  @IsUUID('4')
  @IsOptional()
  eventId?: string

  @IsISO8601({ strict: true })
  @IsOptional()
  timestamp?: string

  @IsObject()
  @IsOptional()
  context?: Record<string, unknown>
}
