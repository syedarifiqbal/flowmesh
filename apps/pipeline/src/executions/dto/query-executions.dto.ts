import { IsOptional, IsString, IsInt, IsUUID, Min, Max, IsIn } from 'class-validator'
import { Type } from 'class-transformer'

export class QueryExecutionsDto {
  @IsOptional()
  @IsUUID()
  pipelineId?: string

  @IsOptional()
  @IsIn(['running', 'completed', 'failed'])
  status?: 'running' | 'completed' | 'failed'

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
}
