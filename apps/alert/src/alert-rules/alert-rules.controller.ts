import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode,
} from '@nestjs/common'
import { WorkspaceId } from '@flowmesh/nestjs-common'
import { AlertRulesService } from './alert-rules.service'
import { EvaluatorService } from '../evaluator/evaluator.service'
import { CreateAlertRuleDto } from './dto/create-alert-rule.dto'
import { UpdateAlertRuleDto } from './dto/update-alert-rule.dto'
import { QueryHistoryDto } from './dto/query-history.dto'

@Controller('alert-rules')
export class AlertRulesController {
  constructor(
    private readonly service: AlertRulesService,
    private readonly evaluator: EvaluatorService,
  ) {}

  @Post()
  create(@WorkspaceId() workspaceId: string, @Body() dto: CreateAlertRuleDto) {
    return this.service.create(dto, workspaceId)
  }

  @Get()
  findAll(@WorkspaceId() workspaceId: string) {
    return this.service.findAll(workspaceId)
  }

  @Get('history')
  findHistory(@WorkspaceId() workspaceId: string, @Query() query: QueryHistoryDto) {
    return this.service.findHistory(workspaceId, query)
  }

  @Get(':id')
  findOne(@WorkspaceId() workspaceId: string, @Param('id') id: string) {
    return this.service.findOne(id, workspaceId)
  }

  @Patch(':id')
  update(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAlertRuleDto,
  ) {
    return this.service.update(id, dto, workspaceId)
  }

  @Patch(':id/toggle')
  toggle(@WorkspaceId() workspaceId: string, @Param('id') id: string) {
    return this.service.toggle(id, workspaceId)
  }

  @Post(':id/test')
  @HttpCode(200)
  async test(@WorkspaceId() workspaceId: string, @Param('id') id: string) {
    const rule = await this.service.findOne(id, workspaceId)
    await this.evaluator.sendTestNotification(rule)
    return { sent: true }
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@WorkspaceId() workspaceId: string, @Param('id') id: string) {
    return this.service.remove(id, workspaceId)
  }
}
