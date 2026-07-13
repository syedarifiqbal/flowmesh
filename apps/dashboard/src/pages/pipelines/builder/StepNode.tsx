import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Filter, Shuffle, Sparkles, Share2, Trash2 } from 'lucide-react'
import type { StepNodeData } from './PipelineBuilderPage'
import type { StepType } from '@flowmesh/shared-types'

const STEP_STYLES: Record<StepType, { bg: string; border: string; icon: React.ReactNode; label: string }> = {
  filter: {
    bg: 'bg-orange-50',
    border: 'border-orange-400',
    icon: <Filter className="w-3.5 h-3.5 text-orange-600" />,
    label: 'Filter',
  },
  transform: {
    bg: 'bg-blue-50',
    border: 'border-blue-400',
    icon: <Shuffle className="w-3.5 h-3.5 text-blue-600" />,
    label: 'Transform',
  },
  enrich: {
    bg: 'bg-green-50',
    border: 'border-green-400',
    icon: <Sparkles className="w-3.5 h-3.5 text-green-600" />,
    label: 'Enrich',
  },
  destination: {
    bg: 'bg-violet-50',
    border: 'border-violet-400',
    icon: <Share2 className="w-3.5 h-3.5 text-violet-600" />,
    label: 'Destination',
  },
}

const BADGE_STYLES: Record<StepType, string> = {
  filter: 'bg-orange-100 text-orange-700',
  transform: 'bg-blue-100 text-blue-700',
  enrich: 'bg-green-100 text-green-700',
  destination: 'bg-violet-100 text-violet-700',
}

export default function StepNode({ data, selected }: NodeProps) {
  const { step, onDelete } = data as StepNodeData
  const style = STEP_STYLES[step.type]

  return (
    <div
      className={`bg-white border-2 ${style.border} rounded-xl shadow-sm px-4 py-3 w-64 ${
        selected ? 'ring-2 ring-offset-1 ring-indigo-400' : ''
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-gray-400 !w-3 !h-3 !border-2 !border-white"
      />

      <div className="flex items-center gap-2">
        <div className={`w-6 h-6 rounded-full flex items-center justify-center ${style.bg}`}>
          {style.icon}
        </div>
        <span className={`text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${BADGE_STYLES[step.type]}`}>
          {style.label}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(step.id) }}
          aria-label={`Delete step ${step.name}`}
          className="ml-auto p-1 text-gray-300 hover:text-red-500 rounded transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <p className="text-sm font-medium text-gray-800 mt-2 truncate">{step.name}</p>
      <p className="text-xs text-gray-400 mt-0.5 truncate">
        {stepSummary(step.type, step.config)}
      </p>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-gray-400 !w-3 !h-3 !border-2 !border-white"
      />
    </div>
  )
}

function stepSummary(type: StepType, config: Record<string, unknown>): string {
  switch (type) {
    case 'filter': {
      const conds = (config.conditions as { field: string; operator: string; value: string }[] | undefined) ?? []
      return conds.length > 0 ? `${conds.length} condition${conds.length !== 1 ? 's' : ''}` : 'No conditions'
    }
    case 'transform': {
      const maps = (config.mappings as unknown[] | undefined) ?? []
      return maps.length > 0 ? `${maps.length} field mapping${maps.length !== 1 ? 's' : ''}` : 'No mappings'
    }
    case 'enrich': {
      const props = config.properties as Record<string, unknown> | undefined
      const count = props ? Object.keys(props).length : 0
      return count > 0 ? `${count} propert${count !== 1 ? 'ies' : 'y'}` : 'No properties'
    }
    case 'destination': {
      return (config.destinationId as string) ? 'Destination selected' : 'No destination selected'
    }
  }
}
