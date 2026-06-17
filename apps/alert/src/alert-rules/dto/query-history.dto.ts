import { IsOptional, IsInt, Min, Max, IsString } from 'class-validator'
import { Type } from 'class-transformer'

export class QueryHistoryDto {
  @IsOptional()
  @IsString()
  ruleId?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0
}
