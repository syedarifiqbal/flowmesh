import { IsOptional, IsString, IsInt, Min, Max, IsIn } from 'class-validator'
import { Type } from 'class-transformer'

export class QueryEventsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 50

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  offset?: number = 0

  @IsOptional()
  @IsString()
  event?: string

  @IsOptional()
  @IsString()
  source?: string

  @IsOptional()
  @IsString()
  search?: string

  @IsOptional()
  @IsString()
  userId?: string

  @IsOptional()
  @IsString()
  anonymousId?: string

  @IsOptional()
  @IsIn(['receivedAt', 'eventName'])
  sortBy?: 'receivedAt' | 'eventName' = 'receivedAt'
}
