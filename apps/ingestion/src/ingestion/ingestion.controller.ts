import {
  Controller,
  Post,
  Body,
  HttpCode,
  Headers,
  BadRequestException,
} from '@nestjs/common'
import { IngestionService } from './ingestion.service'
import { IngestEventDto } from './dto/ingest-event.dto'
import { IngestBatchDto } from './dto/ingest-batch.dto'

@Controller('events')
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  @Post()
  @HttpCode(202)
  async ingest(
    @Body() dto: IngestEventDto,
    @Headers('x-workspace-id') workspaceId: string,
  ) {
    if (!workspaceId) throw new BadRequestException('x-workspace-id header is required')

    const result = await this.ingestionService.ingest(dto, workspaceId)
    return result
  }

  @Post('batch')
  @HttpCode(202)
  async ingestBatch(
    @Body() dto: IngestBatchDto,
    @Headers('x-workspace-id') workspaceId: string,
  ) {
    if (!workspaceId) throw new BadRequestException('x-workspace-id header is required')

    const results = await this.ingestionService.ingestBatch(dto.events, workspaceId)

    return {
      accepted: results.filter((r) => r.status === 'accepted').length,
      duplicates: results.filter((r) => r.status === 'duplicate').length,
      results,
    }
  }
}
