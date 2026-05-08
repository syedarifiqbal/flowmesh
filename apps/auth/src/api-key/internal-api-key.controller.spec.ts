import { describe, it, expect, vi, beforeEach } from 'vitest'
import { UnauthorizedException } from '@nestjs/common'
import { InternalApiKeyController } from './internal-api-key.controller'
import { ApiKeyService } from './api-key.service'

const makeApiKeyService = () => ({
  validateByHash: vi.fn(),
}) as unknown as ApiKeyService

describe('InternalApiKeyController', () => {
  let service: ReturnType<typeof makeApiKeyService>
  let controller: InternalApiKeyController

  beforeEach(() => {
    vi.clearAllMocks()
    service = makeApiKeyService()
    controller = new InternalApiKeyController(service)
  })

  it('returns workspaceId for a valid key hash', async () => {
    vi.mocked(service.validateByHash).mockResolvedValue({ workspaceId: 'ws-uuid-1' })
    const result = await controller.validate({ keyHash: 'abc123' })
    expect(result).toEqual({ workspaceId: 'ws-uuid-1' })
  })

  it('throws UnauthorizedException when key hash not found', async () => {
    vi.mocked(service.validateByHash).mockResolvedValue(null)
    await expect(controller.validate({ keyHash: 'unknown' })).rejects.toThrow(UnauthorizedException)
  })
})
