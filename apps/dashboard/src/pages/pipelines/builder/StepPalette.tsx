import { Filter, Shuffle, Sparkles, Share2 } from 'lucide-react'
import type { StepType } from '@flowmesh/shared-types'

interface Props {
  onAddStep: (type: StepType) => void
}

const STEPS: { type: StepType; label: string; description: string; icon: React.ReactNode; color: string }[] = [
  {
    type: 'filter',
    label: 'Filter',
    description: 'Drop events that don\'t match conditions',
    icon: <Filter className="w-4 h-4 text-orange-600" />,
    color: 'border-orange-200 hover:border-orange-400 hover:bg-orange-50',
  },
  {
    type: 'transform',
    label: 'Transform',
    description: 'Rename or remap event fields',
    icon: <Shuffle className="w-4 h-4 text-blue-600" />,
    color: 'border-blue-200 hover:border-blue-400 hover:bg-blue-50',
  },
  {
    type: 'enrich',
    label: 'Enrich',
    description: 'Add static properties to events',
    icon: <Sparkles className="w-4 h-4 text-green-600" />,
    color: 'border-green-200 hover:border-green-400 hover:bg-green-50',
  },
  {
    type: 'destination',
    label: 'Destination',
    description: 'Deliver event to a destination',
    icon: <Share2 className="w-4 h-4 text-violet-600" />,
    color: 'border-violet-200 hover:border-violet-400 hover:bg-violet-50',
  },
]

export default function StepPalette({ onAddStep }: Props) {
  return (
    <div className="w-56 shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-y-auto">
      <div className="px-4 pt-4 pb-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Steps</p>
        <p className="text-xs text-gray-400 mt-0.5">Click to add to pipeline</p>
      </div>

      <div className="px-3 pb-4 space-y-2">
        {STEPS.map((step) => (
          <button
            key={step.type}
            onClick={() => onAddStep(step.type)}
            className={`w-full text-left px-3 py-3 rounded-lg border bg-white transition-colors cursor-pointer ${step.color}`}
          >
            <div className="flex items-center gap-2 mb-1">
              {step.icon}
              <span className="text-sm font-medium text-gray-800">{step.label}</span>
            </div>
            <p className="text-xs text-gray-500 leading-snug">{step.description}</p>
          </button>
        ))}
      </div>
    </div>
  )
}
