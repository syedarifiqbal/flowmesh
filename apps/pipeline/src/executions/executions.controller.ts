import { Controller, Get, Param, Query } from '@nestjs/common'
import { WorkspaceId } from '@flowmesh/nestjs-common'
import { ExecutionsService } from './executions.service'
import { QueryExecutionsDto } from './dto/query-executions.dto'

@Controller('executions')
export class ExecutionsController {
  constructor(private readonly service: ExecutionsService) {}

  @Get()
  findAll(
    @WorkspaceId() workspaceId: string,
    @Query() query: QueryExecutionsDto,
  ) {
    return this.service.findAll(workspaceId, query)
  }

  @Get(':id')
  findOne(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
  ) {
    return this.service.findOne(workspaceId, id)
  }
}
