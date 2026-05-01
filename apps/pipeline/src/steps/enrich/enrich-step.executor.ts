import { Injectable } from '@nestjs/common'
import { FlowMeshEvent } from '@flowmesh/shared-types'

interface EnrichConfig {
  fields: Record<string, unknown>
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

@Injectable()
export class EnrichStepExecutor {
  execute(event: FlowMeshEvent, config: Record<string, unknown>): FlowMeshEvent {
    const { fields } = config as unknown as EnrichConfig
    if (!fields || Object.keys(fields).length === 0) return event

    const result = structuredClone(event) as unknown as Record<string, unknown>

    for (const [fieldPath, value] of Object.entries(fields)) {
      setField(result, fieldPath, value)
    }

    return result as unknown as FlowMeshEvent
  }
}
