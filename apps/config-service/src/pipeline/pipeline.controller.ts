import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Headers, HttpCode, HttpStatus,
  ParseUUIDPipe, BadRequestException,
} from '@nestjs/common'
import { PipelineService } from './pipeline.service'
import { CreatePipelineDto } from './dto/create-pipeline.dto'
import { UpdatePipelineDto } from './dto/update-pipeline.dto'

@Controller('pipelines')
export class PipelineController {
  constructor(private readonly service: PipelineService) {}

  private workspaceId(header: string | undefined): string {
    if (!header) throw new BadRequestException('x-workspace-id header is required')
    return header
  }

  @Post()
  create(
    @Headers('x-workspace-id') workspaceId: string | undefined,
    @Body() dto: CreatePipelineDto,
  ) {
    return this.service.create(this.workspaceId(workspaceId), dto)
  }

  @Get()
  findAll(@Headers('x-workspace-id') workspaceId: string | undefined) {
    return this.service.findAll(this.workspaceId(workspaceId))
  }

  @Get(':id')
  findOne(
    @Headers('x-workspace-id') workspaceId: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.findOne(this.workspaceId(workspaceId), id)
  }

  @Put(':id')
  update(
    @Headers('x-workspace-id') workspaceId: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePipelineDto,
  ) {
    return this.service.update(this.workspaceId(workspaceId), id, dto)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Headers('x-workspace-id') workspaceId: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.remove(this.workspaceId(workspaceId), id)
  }
}
