import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
  ParseUUIDPipe,
} from '@nestjs/common'
import { Request } from 'express'
import { ApiKeyService } from './api-key.service'
import { AuthGuard } from '../auth/auth.guard'
import { CreateApiKeyDto } from './dto/create-api-key.dto'

interface AuthenticatedRequest extends Request {
  user: { sub: string; workspaceId: string; type: 'access' }
}

@Controller('auth/api-keys')
@UseGuards(AuthGuard)
export class ApiKeyController {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  @Post()
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateApiKeyDto) {
    return this.apiKeyService.create(req.user.workspaceId, dto)
  }

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.apiKeyService.list(req.user.workspaceId)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.apiKeyService.revoke(req.user.workspaceId, id)
  }
}
