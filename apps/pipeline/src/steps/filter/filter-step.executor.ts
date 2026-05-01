import { Injectable } from '@nestjs/common'
import { FlowMeshEvent } from '@flowmesh/shared-types'

type FilterOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'starts_with'
  | 'ends_with'
  | 'greater_than'
  | 'less_than'
  | 'in'
  | 'not_in'
  | 'exists'

interface FilterCondition {
  field: string
  operator: FilterOperator
  value: unknown
}

interface FilterConfig {
  conditions: FilterCondition[]
  logic: 'AND' | 'OR'
}

function getField(event: FlowMeshEvent, fieldPath: string): unknown {
  const parts = fieldPath.split('.')
  let current: unknown = event
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

function evaluateCondition(value: unknown, operator: FilterOperator, expected: unknown): boolean {
  switch (operator) {
    case 'equals':
      return value === expected
    case 'not_equals':
      return value !== expected
    case 'contains':
      return typeof value === 'string' && typeof expected === 'string' && value.includes(expected)
    case 'starts_with':
      return typeof value === 'string' && typeof expected === 'string' && value.startsWith(expected)
    case 'ends_with':
      return typeof value === 'string' && typeof expected === 'string' && value.endsWith(expected)
    case 'greater_than':
      return typeof value === 'number' && typeof expected === 'number' && value > expected
    case 'less_than':
      return typeof value === 'number' && typeof expected === 'number' && value < expected
    case 'in':
      return Array.isArray(expected) && expected.includes(value)
    case 'not_in':
      return Array.isArray(expected) && !expected.includes(value)
    case 'exists':
      return expected === true ? value !== undefined && value !== null : value === undefined || value === null
    default:
      return false
  }
}

@Injectable()
export class FilterStepExecutor {
  execute(event: FlowMeshEvent, config: Record<string, unknown>): boolean {
    const { conditions, logic } = config as unknown as FilterConfig

    if (!conditions || conditions.length === 0) return true

    const results = conditions.map((condition) => {
      const value = getField(event, condition.field)
      return evaluateCondition(value, condition.operator, condition.value)
    })

    return logic === 'OR' ? results.some(Boolean) : results.every(Boolean)
  }
}
