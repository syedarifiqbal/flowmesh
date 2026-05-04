import { describe, it, expect } from 'vitest'
import { BadRequestException } from '@nestjs/common'
import { resolveWorkspaceId } from './workspace-id.pipe'

describe('resolveWorkspaceId', () => {
  it('returns the workspace id when the header is present', () => {
    expect(resolveWorkspaceId({ 'x-workspace-id': 'ws-uuid-1' })).toBe('ws-uuid-1')
  })

  it('throws BadRequestException when the header is missing', () => {
    expect(() => resolveWorkspaceId({})).toThrow(BadRequestException)
  })

  it('throws BadRequestException when the header is an empty string', () => {
    expect(() => resolveWorkspaceId({ 'x-workspace-id': '' })).toThrow(BadRequestException)
  })
})
