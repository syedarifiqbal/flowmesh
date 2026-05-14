import { Controller, Post, Get, Body, HttpCode, Query, Headers } from '@nestjs/common'
import { WorkspaceId, CORRELATION_ID_HEADER } from '@flowmesh/nestjs-common'
import { IngestionService } from './ingestion.service'
import { IngestEventDto } from './dto/ingest-event.dto'
import { IngestBatchDto } from './dto/ingest-batch.dto'
import { IdentifyDto } from './dto/identify.dto'
import { AliasDto } from './dto/alias.dto'
import { PageDto } from './dto/page.dto'
import { GroupDto } from './dto/group.dto'
import { QueryEventsDto } from './dto/query-events.dto'
import { ThroughputQueryDto } from './dto/throughput-query.dto'

@Controller('events')
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  @Get('throughput')
  getThroughput(
    @WorkspaceId() workspaceId: string,
    @Query() query: ThroughputQueryDto,
  ) {
    return this.ingestionService.getThroughput(workspaceId, query)
  }

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
    @Headers(CORRELATION_ID_HEADER) headerCorrelationId: string,
    @Body() dto: IngestEventDto,
  ) {
    // Use body correlationId if provided, otherwise fall back to the
    // x-correlation-id header that the API gateway always sets.
    const correlationId = dto.correlationId ?? headerCorrelationId
    return this.ingestionService.ingest({ ...dto, correlationId }, workspaceId)
  }

  @Post('identify')
  @HttpCode(202)
  async identify(
    @WorkspaceId() workspaceId: string,
    @Headers(CORRELATION_ID_HEADER) headerCorrelationId: string,
    @Body() dto: IdentifyDto,
  ) {
    const correlationId = dto.correlationId ?? headerCorrelationId
    return this.ingestionService.identify({ ...dto, correlationId }, workspaceId)
  }

  @Post('alias')
  @HttpCode(202)
  async alias(
    @WorkspaceId() workspaceId: string,
    @Headers(CORRELATION_ID_HEADER) headerCorrelationId: string,
    @Body() dto: AliasDto,
  ) {
    const correlationId = dto.correlationId ?? headerCorrelationId
    return this.ingestionService.alias({ ...dto, correlationId }, workspaceId)
  }

  @Post('page')
  @HttpCode(202)
  async page(
    @WorkspaceId() workspaceId: string,
    @Headers(CORRELATION_ID_HEADER) headerCorrelationId: string,
    @Body() dto: PageDto,
  ) {
    const correlationId = dto.correlationId ?? headerCorrelationId
    return this.ingestionService.page({ ...dto, correlationId }, workspaceId)
  }

  @Post('group')
  @HttpCode(202)
  async group(
    @WorkspaceId() workspaceId: string,
    @Headers(CORRELATION_ID_HEADER) headerCorrelationId: string,
    @Body() dto: GroupDto,
  ) {
    const correlationId = dto.correlationId ?? headerCorrelationId
    return this.ingestionService.group({ ...dto, correlationId }, workspaceId)
  }

  @Post('batch')
  @HttpCode(202)
  async ingestBatch(
    @WorkspaceId() workspaceId: string,
    @Headers(CORRELATION_ID_HEADER) headerCorrelationId: string,
    @Body() dto: IngestBatchDto,
  ) {
    const events = dto.events.map((e) => ({
      ...e,
      correlationId: e.correlationId ?? headerCorrelationId,
    }))
    const results = await this.ingestionService.ingestBatch(events, workspaceId)
    return {
      accepted: results.filter((r) => r.status === 'accepted').length,
      duplicates: results.filter((r) => r.status === 'duplicate').length,
      results,
    }
  }
}
