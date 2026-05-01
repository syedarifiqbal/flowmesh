import { Injectable } from '@nestjs/common'
import { FlowMeshEvent } from '@flowmesh/shared-types'

type TransformOp = 'set' | 'rename' | 'delete'

interface SetOperation {
  op: 'set'
  field: string
  value: unknown
}

interface RenameOperation {
  op: 'rename'
  from: string
  to: string
}

interface DeleteOperation {
  op: 'delete'
  field: string
}

type TransformOperation = SetOperation | RenameOperation | DeleteOperation

interface TransformConfig {
  operations: TransformOperation[]
}

function getField(obj: Record<string, unknown>, fieldPath: string): unknown {
  const parts = fieldPath.split('.')
  let current: unknown = obj
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

function setField(obj: Record<string, unknown>, fieldPath: string, value: unknown): void {
  const parts = fieldPath.split('.')
  let current = obj
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]
    if (!(part in current) || typeof current[part] !== 'object' || current[part] == null) {
      current[part] = {}
    }
    current = current[part] as Record<string, unknown>
  }
  current[parts[parts.length - 1]] = value
}

function deleteField(obj: Record<string, unknown>, fieldPath: string): void {
  const parts = fieldPath.split('.')
  let current = obj
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]
    if (!(part in current) || typeof current[part] !== 'object') return
    current = current[part] as Record<string, unknown>
  }
  delete current[parts[parts.length - 1]]
}

@Injectable()
export class TransformStepExecutor {
  execute(event: FlowMeshEvent, config: Record<string, unknown>): FlowMeshEvent {
    const { operations } = config as unknown as TransformConfig
    if (!operations || operations.length === 0) return event

    const result = structuredClone(event) as unknown as Record<string, unknown>

    for (const op of operations) {
      if (op.op === 'set') {
        setField(result, op.field, op.value)
      } else if (op.op === 'rename') {
        const value = getField(result, op.from)
        deleteField(result, op.from)
        setField(result, op.to, value)
      } else if (op.op === 'delete') {
        deleteField(result, op.field)
      }
    }

    return result as unknown as FlowMeshEvent
  }
}
