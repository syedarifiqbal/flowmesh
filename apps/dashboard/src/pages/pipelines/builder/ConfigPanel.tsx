import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { PipelineStep } from '@flowmesh/shared-types'

interface Destination {
  id: string
  name: string
  type: string
}

interface Props {
  step: PipelineStep | null
  destinations: Destination[]
  onUpdateConfig: (config: Record<string, unknown>) => void
  onUpdateName: (name: string) => void
}

// UI-only types (what we show in the form)
type Condition = { field: string; operator: string; value: string }
type Mapping = { from: string; to: string }
type EnrichEntry = { key: string; value: string }

// Operator values match the FilterStepExecutor exactly
const OPERATORS = [
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'not equals' },
  { value: 'greater_than', label: 'greater than' },
  { value: 'less_than', label: 'less than' },
  { value: 'contains', label: 'contains' },
  { value: 'starts_with', label: 'starts with' },
  { value: 'ends_with', label: 'ends with' },
  { value: 'in', label: 'in (comma-separated)' },
  { value: 'not_in', label: 'not in (comma-separated)' },
  { value: 'exists', label: 'exists' },
]

export default function ConfigPanel({ step, destinations, onUpdateConfig, onUpdateName }: Props) {
  if (!step) {
    return (
      <div className="w-72 shrink-0 bg-white border-l border-gray-200 flex items-center justify-center">
        <div className="text-center px-6">
          <p className="text-sm text-gray-400">Select a step on the canvas to configure it</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-72 shrink-0 bg-white border-l border-gray-200 flex flex-col overflow-y-auto">
      <div className="px-4 pt-4 pb-3 border-b border-gray-100">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Step name</p>
        <StepNameInput key={step.id} name={step.name} onUpdate={onUpdateName} />
      </div>

      <div className="px-4 pt-3 pb-6 flex-1">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Configuration</p>
        {step.type === 'filter' && (
          <FilterConfig key={step.id} config={step.config} onUpdate={onUpdateConfig} />
        )}
        {step.type === 'transform' && (
          <TransformConfig key={step.id} config={step.config} onUpdate={onUpdateConfig} />
        )}
        {step.type === 'enrich' && (
          <EnrichConfig key={step.id} config={step.config} onUpdate={onUpdateConfig} />
        )}
        {step.type === 'destination' && (
          <DestinationConfig key={step.id} config={step.config} destinations={destinations} onUpdate={onUpdateConfig} />
        )}
      </div>
    </div>
  )
}

function StepNameInput({ name, onUpdate }: { name: string; onUpdate: (n: string) => void }) {
  const [value, setValue] = useState(name)
  useEffect(() => { setValue(name) }, [name])

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onUpdate(value)}
      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
    />
  )
}

// Executor format: { conditions: [{ field, operator, value }], logic: 'AND' | 'OR' }
// operator values: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains' | 'starts_with' | 'ends_with' | 'in' | 'not_in' | 'exists'
function FilterConfig({ config, onUpdate }: { config: Record<string, unknown>; onUpdate: (c: Record<string, unknown>) => void }) {
  const [conditions, setConditions] = useState<Condition[]>(() => {
    const saved = config.conditions as Condition[] | undefined
    return saved && saved.length > 0 ? saved : [{ field: '', operator: 'equals', value: '' }]
  })

  const commit = (next: Condition[]) => {
    setConditions(next)
    // Save in executor format: logic defaults to AND
    onUpdate({ conditions: next, logic: 'AND' })
  }

  const add = () => commit([...conditions, { field: '', operator: 'equals', value: '' }])
  const remove = (i: number) => commit(conditions.filter((_, idx) => idx !== i))
  const update = (i: number, patch: Partial<Condition>) =>
    commit(conditions.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))

  return (
    <div className="space-y-3">
      {conditions.map((c, i) => (
        <div key={i} className="space-y-1.5 p-3 bg-gray-50 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Condition {i + 1}</span>
            {conditions.length > 1 && (
              <button onClick={() => remove(i)} aria-label="Remove condition" className="text-gray-400 hover:text-red-500">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <input
            type="text"
            placeholder="Field path (e.g. properties.amount)"
            value={c.field}
            onChange={(e) => update(i, { field: e.target.value })}
            className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
          <select
            value={c.operator}
            onChange={(e) => update(i, { operator: e.target.value })}
            className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
          >
            {OPERATORS.map((op) => (
              <option key={op.value} value={op.value}>{op.label}</option>
            ))}
          </select>
          {c.operator !== 'exists' && (
            <input
              type="text"
              placeholder={c.operator === 'in' || c.operator === 'not_in' ? 'a, b, c' : 'Value'}
              value={c.value}
              onChange={(e) => update(i, { value: e.target.value })}
              className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          )}
        </div>
      ))}

      <button
        onClick={add}
        className="inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
      >
        <Plus className="w-3.5 h-3.5" />
        Add condition
      </button>

      <p className="text-xs text-gray-400">All conditions must match (AND logic).</p>
    </div>
  )
}

// Executor format: { operations: [{ op: 'rename', from, to }] }
// We show a simple from/to UI and convert on save.
function TransformConfig({ config, onUpdate }: { config: Record<string, unknown>; onUpdate: (c: Record<string, unknown>) => void }) {
  // Load from either builder format (operations array) or legacy UI format
  const [mappings, setMappings] = useState<Mapping[]>(() => {
    const ops = config.operations as { op: string; from?: string; to?: string }[] | undefined
    if (ops && ops.length > 0) {
      return ops
        .filter((o) => o.op === 'rename' && o.from && o.to)
        .map((o) => ({ from: o.from!, to: o.to! }))
    }
    return [{ from: '', to: '' }]
  })

  const commit = (next: Mapping[]) => {
    setMappings(next)
    // Save in executor format
    onUpdate({
      operations: next
        .filter((m) => m.from && m.to)
        .map((m) => ({ op: 'rename', from: m.from, to: m.to })),
    })
  }

  const add = () => commit([...mappings, { from: '', to: '' }])
  const remove = (i: number) => commit(mappings.filter((_, idx) => idx !== i))
  const update = (i: number, patch: Partial<Mapping>) =>
    commit(mappings.map((m, idx) => (idx === i ? { ...m, ...patch } : m)))

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1 px-1">
        <span className="text-xs font-medium text-gray-400">From field</span>
        <span className="text-xs font-medium text-gray-400">To field</span>
      </div>

      {mappings.map((m, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input
            type="text"
            placeholder="properties.amount"
            value={m.from}
            onChange={(e) => update(i, { from: e.target.value })}
            className="flex-1 min-w-0 px-2.5 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
          <span className="text-gray-400 text-xs shrink-0">→</span>
          <input
            type="text"
            placeholder="properties.price"
            value={m.to}
            onChange={(e) => update(i, { to: e.target.value })}
            className="flex-1 min-w-0 px-2.5 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
          {mappings.length > 1 && (
            <button onClick={() => remove(i)} aria-label="Remove mapping" className="shrink-0 text-gray-400 hover:text-red-500">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ))}

      <button
        onClick={add}
        className="inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
      >
        <Plus className="w-3.5 h-3.5" />
        Add rename
      </button>

      <p className="text-xs text-gray-400">
        Use dot notation: <span className="font-mono">properties.amount</span>
      </p>
    </div>
  )
}

// Executor format: { fields: { 'field.path': value } }
// We show a key/value UI and save as { fields: { key: value } } where key is the full field path.
function EnrichConfig({ config, onUpdate }: { config: Record<string, unknown>; onUpdate: (c: Record<string, unknown>) => void }) {
  const [entries, setEntries] = useState<EnrichEntry[]>(() => {
    // Support both executor format (fields) and any existing data
    const fields = (config.fields ?? config.properties) as Record<string, string> | undefined
    const e = fields ? Object.entries(fields).map(([key, value]) => ({ key, value: String(value) })) : []
    return e.length > 0 ? e : [{ key: '', value: '' }]
  })

  const commit = (next: EnrichEntry[]) => {
    setEntries(next)
    // Save in executor format: { fields: { fieldPath: value } }
    const fields: Record<string, string> = {}
    for (const e of next) {
      if (e.key) fields[e.key] = e.value
    }
    onUpdate({ fields })
  }

  const add = () => commit([...entries, { key: '', value: '' }])
  const remove = (i: number) => commit(entries.filter((_, idx) => idx !== i))
  const update = (i: number, patch: Partial<EnrichEntry>) =>
    commit(entries.map((e, idx) => (idx === i ? { ...e, ...patch } : e)))

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1 px-1">
        <span className="text-xs font-medium text-gray-400">Field path</span>
        <span className="text-xs font-medium text-gray-400">Value</span>
      </div>

      {entries.map((e, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input
            type="text"
            placeholder="properties.env"
            value={e.key}
            onChange={(ev) => update(i, { key: ev.target.value })}
            className="flex-1 min-w-0 px-2.5 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
          <input
            type="text"
            placeholder="production"
            value={e.value}
            onChange={(ev) => update(i, { value: ev.target.value })}
            className="flex-1 min-w-0 px-2.5 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
          {entries.length > 1 && (
            <button onClick={() => remove(i)} aria-label="Remove field" className="shrink-0 text-gray-400 hover:text-red-500">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ))}

      <button
        onClick={add}
        className="inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
      >
        <Plus className="w-3.5 h-3.5" />
        Add field
      </button>

      <p className="text-xs text-gray-400">
        Full field path, e.g. <span className="font-mono">properties.environment</span>
      </p>
    </div>
  )
}

function DestinationConfig({
  config,
  destinations,
  onUpdate,
}: {
  config: Record<string, unknown>
  destinations: Destination[]
  onUpdate: (c: Record<string, unknown>) => void
}) {
  const [selected, setSelected] = useState<string>((config.destinationId as string) ?? '')

  const handleChange = (id: string) => {
    setSelected(id)
    onUpdate({ destinationId: id })
  }

  if (destinations.length === 0) {
    return (
      <p className="text-xs text-gray-500">
        No destinations available. Create one on the Destinations page first.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {destinations.map((dest) => (
        <label
          key={dest.id}
          className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
            selected === dest.id
              ? 'border-violet-400 bg-violet-50'
              : 'border-gray-200 hover:border-violet-300 hover:bg-violet-50/40'
          }`}
        >
          <input
            type="radio"
            name="destination"
            value={dest.id}
            checked={selected === dest.id}
            onChange={() => handleChange(dest.id)}
            className="text-violet-600 border-gray-300"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate">{dest.name}</p>
          </div>
          <span className="shrink-0 px-1.5 py-0.5 bg-violet-100 text-violet-700 text-xs rounded-full border border-violet-200">
            {dest.type}
          </span>
        </label>
      ))}
    </div>
  )
}
