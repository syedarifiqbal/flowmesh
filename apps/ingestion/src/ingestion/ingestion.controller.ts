import { Controller, Post, Get, Body, HttpCode, Query } from '@nestjs/common'
import { WorkspaceId } from '@flowmesh/nestjs-common'
import { IngestionService } from './ingestion.service'
import { IngestEventDto } from './dto/ingest-event.dto'
import { IngestBatchDto } from './dto/ingest-batch.dto'
import { QueryEventsDto } from './dto/query-events.dto'

@Controller('events')
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  @Get()
  findAll(
    @WorkspaceId() workspaceId: string,
    @Query() query: QueryEventsDto,
  ) {
    return this.ingestionService.findAll(workspaceId, query)
  }

  @Post()
  @HttpCode(202)
  async ingest(
    @WorkspaceId() workspaceId: string,
    @Body() dto: IngestEventDto,
  ) {
    return this.ingestionService.ingest(dto, workspaceId)
  }

  @Post('batch')
  @HttpCode(202)
  async ingestBatch(
    @WorkspaceId() workspaceId: string,
    @Body() dto: IngestBatchDto,
  ) {
    const results = await this.ingestionService.ingestBatch(dto.events, workspaceId)
    return {
      accepted: results.filter((r) => r.status === 'accepted').length,
      duplicates: results.filter((r) => r.status === 'duplicate').length,
      results,
    }
  }
}
