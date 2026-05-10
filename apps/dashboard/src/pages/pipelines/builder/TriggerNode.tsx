import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Zap } from 'lucide-react'
import type { TriggerNodeData } from './PipelineBuilderPage'

export default function TriggerNode({ data }: NodeProps) {
  const { events } = data as TriggerNodeData

  return (
    <div className="bg-white border-2 border-indigo-500 rounded-xl shadow-sm px-4 py-3 w-64">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center">
          <Zap className="w-3.5 h-3.5 text-indigo-600" />
        </div>
        <span className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">Trigger</span>
      </div>

      {events.length === 0 ? (
        <p className="text-xs text-gray-400 italic">No events configured</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {events.map((event) => (
            <span
              key={event}
              className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs font-mono rounded-full border border-indigo-200"
            >
              {event}
            </span>
          ))}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-indigo-500 !w-3 !h-3 !border-2 !border-white"
      />
    </div>
  )
}
