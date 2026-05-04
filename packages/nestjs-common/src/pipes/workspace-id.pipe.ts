import { BadRequestException, createParamDecorator, ExecutionContext } from '@nestjs/common'
import type { Request } from 'express'

export function resolveWorkspaceId(headers: Record<string, string | string[] | undefined>): string {
  const value = headers['x-workspace-id'] as string | undefined
  if (!value) throw new BadRequestException('x-workspace-id header is required')
  return value
}

export const WorkspaceId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string =>
    resolveWorkspaceId(ctx.switchToHttp().getRequest<Request>().headers),
)
