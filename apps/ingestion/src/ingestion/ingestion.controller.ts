import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  Headers,
  BadRequestException,
  Query,
} from '@nestjs/common'
import { IngestionService } from './ingestion.service'
import { IngestEventDto } from './dto/ingest-event.dto'
import { IngestBatchDto } from './dto/ingest-batch.dto'
import { QueryEventsDto } from './dto/query-events.dto'

@Controller('events')
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  @Get()
  async findAll(
    @Headers('x-workspace-id') workspaceId: string,
    @Query() query: QueryEventsDto,
  ) {
    if (!workspaceId) throw new BadRequestException('x-workspace-id header is required')
    return this.ingestionService.findAll(workspaceId, query)
  }

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
