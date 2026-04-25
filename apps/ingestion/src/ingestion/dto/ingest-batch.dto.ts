import { IsArray, ArrayMinSize, ArrayMaxSize, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'
import { IngestEventDto } from './ingest-event.dto'

export class IngestBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => IngestEventDto)
  events!: IngestEventDto[]
}
