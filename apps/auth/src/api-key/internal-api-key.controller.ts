import { Body, Controller, HttpCode, HttpStatus, Post, UnauthorizedException } from '@nestjs/common'
import { IsString, IsNotEmpty } from 'class-validator'
import { ApiKeyService } from './api-key.service'

class ValidateByHashDto {
  @IsString()
  @IsNotEmpty()
  keyHash!: string
}

// Internal endpoint — only reachable from within the Docker network (not exposed publicly)
@Controller('internal/api-keys')
export class InternalApiKeyController {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  async validate(@Body() dto: ValidateByHashDto): Promise<{ workspaceId: string }> {
    const result = await this.apiKeyService.validateByHash(dto.keyHash)
    if (!result) throw new UnauthorizedException('invalid api key')
    return result
  }
}
