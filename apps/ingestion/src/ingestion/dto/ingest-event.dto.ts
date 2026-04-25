import {
  IsString,
  IsNotEmpty,
  IsUUID,
  IsISO8601,
  IsOptional,
  IsObject,
  Matches,
  ValidateIf,
} from 'class-validator'

export class IngestEventDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/, {
    message: 'event must be dot notation lowercase, e.g. "order.created"',
  })
  event!: string

  @IsUUID('4')
  correlationId!: string

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

  @ValidateIf((o: IngestEventDto) => !o.anonymousId)
  @IsString()
  @IsNotEmpty({ message: 'userId or anonymousId is required' })
  userId?: string

  @ValidateIf((o: IngestEventDto) => !o.userId)
  @IsString()
  @IsNotEmpty({ message: 'userId or anonymousId is required' })
  anonymousId?: string

  @IsString()
  @IsOptional()
  sessionId?: string

  @IsObject()
  @IsOptional()
  properties?: Record<string, unknown>

  @IsObject()
  @IsOptional()
  context?: Record<string, unknown>
}
