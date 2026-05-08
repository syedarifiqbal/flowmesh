import {
  Controller, Get, Post, Put, Delete,
  Body, Param, HttpCode, HttpStatus,
  ParseUUIDPipe, HttpException,
} from '@nestjs/common'
import { WorkspaceId } from '@flowmesh/nestjs-common'
import { DestinationService } from './destination.service'
import { CreateDestinationDto } from './dto/create-destination.dto'
import { UpdateDestinationDto } from './dto/update-destination.dto'

@Controller('destinations')
export class DestinationController {
  constructor(private readonly service: DestinationService) {}

  @Post()
  create(
    @WorkspaceId() workspaceId: string,
    @Body() dto: CreateDestinationDto,
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
    @Body() dto: UpdateDestinationDto,
  ) {
    return this.service.update(workspaceId, id, dto)
  }

  @Post(':id/test')
  async testConnection(
    @WorkspaceId() workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const result = await this.service.testConnection(workspaceId, id)
    if (!result.ok) {
      throw new HttpException({ ok: false, error: result.error }, HttpStatus.UNPROCESSABLE_ENTITY)
    }
    return { ok: true }
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
