import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common'
import { WorkspaceId } from '@flowmesh/nestjs-common'
import { DestinationService } from './destination.service'

// Internal-only endpoint — not exposed through the API gateway.
// Used by the delivery service to fetch decrypted destination credentials.
@Controller('internal/destinations')
export class InternalDestinationController {
  constructor(private readonly service: DestinationService) {}

  @Get(':id')
  findOneWithConfig(
    @WorkspaceId() workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.findOneWithConfig(workspaceId, id)
  }
}
