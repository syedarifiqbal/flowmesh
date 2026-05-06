import {
  Controller, Get, Post, Put, Delete,
  Body, Param, HttpCode, HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common'
import { WorkspaceId } from '@flowmesh/nestjs-common'
import { PipelineService } from './pipeline.service'
import { CreatePipelineDto } from './dto/create-pipeline.dto'
import { UpdatePipelineDto } from './dto/update-pipeline.dto'

@Controller('pipelines')
export class PipelineController {
  constructor(private readonly service: PipelineService) {}

  @Post()
  create(
    @WorkspaceId() workspaceId: string,
    @Body() dto: CreatePipelineDto,
  ) {
    return this.service.create(workspaceId, dto)
  }

  @Get()
  findAll(@WorkspaceId() workspaceId: string) {
    return this.service.findAll(workspaceId)
  }

  @Get(':id')
  findOne(
    @WorkspaceId() workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.findOne(workspaceId, id)
  }

  @Put(':id')
  update(
    @WorkspaceId() workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePipelineDto,
  ) {
    return this.service.update(workspaceId, id, dto)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @WorkspaceId() workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.remove(workspaceId, id)
  }
}
