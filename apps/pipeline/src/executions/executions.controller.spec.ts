import { describe, it, expect, vi, beforeEach } from 'vitest'
import { randomUUID } from 'crypto'
import { ExecutionsController } from './executions.controller'
import { ExecutionsService } from './executions.service'

const WORKSPACE_ID = randomUUID()
const PIPELINE_ID = randomUUID()

describe('ExecutionsController', () => {
  let controller: ExecutionsController
  let service: { findAll: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    service = { findAll: vi.fn() }
    controller = new ExecutionsController(service as unknown as ExecutionsService)
  })

  it('delegates to service with workspace id and query', async () => {
    const payload = { executions: [], total: 0, limit: 50, offset: 0 }
    service.findAll.mockResolvedValue(payload)

    const result = await controller.findAll(WORKSPACE_ID, { pipelineId: PIPELINE_ID })

    expect(service.findAll).toHaveBeenCalledWith(WORKSPACE_ID, { pipelineId: PIPELINE_ID })
    expect(result).toBe(payload)
  })
})
