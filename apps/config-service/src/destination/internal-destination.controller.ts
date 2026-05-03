import { Controller, Get, Param, Headers, BadRequestException, ParseUUIDPipe } from '@nestjs/common'
import { DestinationService } from './destination.service'

// Internal-only endpoint — not exposed through the API gateway.
// Used by the delivery service to fetch decrypted destination credentials.
@Controller('internal/destinations')
export class InternalDestinationController {
  constructor(private readonly service: DestinationService) {}

  @Get(':id')
  findOneWithConfig(
    @Headers('x-workspace-id') workspaceId: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    if (!workspaceId) throw new BadRequestException('x-workspace-id header is required')
    return this.service.findOneWithConfig(workspaceId, id)
  }
}
