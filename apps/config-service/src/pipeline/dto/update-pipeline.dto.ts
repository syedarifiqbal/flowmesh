import { IsString, IsBoolean, IsArray, IsOptional, ValidateNested, IsUUID } from 'class-validator'
import { Type } from 'class-transformer'
import { PipelineTriggerDto, PipelineStepDto } from './create-pipeline.dto'

export class UpdatePipelineDto {
  @IsString()
  @IsOptional()
  name?: string

  @IsString()
  @IsOptional()
  description?: string

  @ValidateNested()
  @Type(() => PipelineTriggerDto)
  @IsOptional()
  trigger?: PipelineTriggerDto

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PipelineStepDto)
  @IsOptional()
  steps?: PipelineStepDto[]

  @IsBoolean()
  @IsOptional()
  enabled?: boolean

  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  destinations?: string[]
}
