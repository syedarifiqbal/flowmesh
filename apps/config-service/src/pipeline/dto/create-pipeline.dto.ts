import {
  IsString, IsBoolean, IsOptional, IsArray, IsObject,
  IsIn, ArrayMinSize, ValidateNested, IsUUID,
} from 'class-validator'
import { Type } from 'class-transformer'

export class PipelineTriggerDto {
  @IsIn(['event'])
  type!: 'event'

  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  events!: string[]
}

export class PipelineStepDto {
  @IsUUID()
  id!: string

  @IsIn(['filter', 'transform', 'enrich', 'destination'])
  type!: 'filter' | 'transform' | 'enrich' | 'destination'

  @IsString()
  name!: string

  @IsObject()
  config!: Record<string, unknown>
}

export class CreatePipelineDto {
  @IsString()
  name!: string

  @IsString()
  @IsOptional()
  description?: string

  @ValidateNested()
  @Type(() => PipelineTriggerDto)
  trigger!: PipelineTriggerDto

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PipelineStepDto)
  steps!: PipelineStepDto[]

  @IsBoolean()
  @IsOptional()
  enabled?: boolean
}
