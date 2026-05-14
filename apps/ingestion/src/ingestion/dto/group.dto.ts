import {
  IsString,
  IsNotEmpty,
  IsUUID,
  IsISO8601,
  IsOptional,
  IsObject,
} from 'class-validator'

export class GroupDto {
  @IsString()
  @IsNotEmpty()
  groupId!: string

  @IsString()
  @IsNotEmpty()
  userId!: string

  @IsString()
  @IsNotEmpty()
  source!: string

  @IsString()
  @IsNotEmpty()
  version!: string

  @IsObject()
  @IsOptional()
  traits?: Record<string, unknown>

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
