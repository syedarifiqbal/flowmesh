import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  ReactFlow,
  Background,
  Controls,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
  Panel,
  BackgroundVariant,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { ArrowLeft, Save, Loader2 } from 'lucide-react'
import api from '../../../lib/api'
import type { Pipeline, PipelineStep } from '@flowmesh/shared-types'
import TriggerNode from './TriggerNode'
import StepNode from './StepNode'
import StepPalette from './StepPalette'
import ConfigPanel from './ConfigPanel'

interface Destination {
  id: string
  name: string
  type: string
}

export type StepNodeData = {
  step: PipelineStep
  onDelete: (id: string) => void
  selected: boolean
}

export type TriggerNodeData = {
  events: string[]
}

const nodeTypes: NodeTypes = {
  trigger: TriggerNode,
  step: StepNode,
}

const STEP_X = 320
const TRIGGER_Y = 40
const STEP_GAP = 140

function stepsToNodes(
  steps: PipelineStep[],
  onDelete: (id: string) => void,
): Node[] {
  return steps.map((step, i) => ({
    id: step.id,
    type: 'step',
    position: { x: STEP_X, y: TRIGGER_Y + STEP_GAP + i * STEP_GAP },
    data: { step, onDelete, selected: false } as StepNodeData,
    draggable: true,
  }))
}

function stepsToEdges(triggerNodeId: string, steps: PipelineStep[]): Edge[] {
  const ids = [triggerNodeId, ...steps.map((s) => s.id)]
  return ids.slice(0, -1).map((src, i) => ({
    id: `e-${src}-${ids[i + 1]}`,
    source: src,
    target: ids[i + 1],
    animated: false,
    style: { stroke: '#6366f1', strokeWidth: 2 },
  }))
}

const TRIGGER_NODE_ID = 'trigger'

export default function PipelineBuilderPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [saveError, setSaveError] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  const { data: pipeline, isLoading, error } = useQuery<Pipeline>({
    queryKey: ['pipeline', id],
    queryFn: () => api.get(`/pipelines/${id}`).then((r) => r.data),
    enabled: !!id,
  })

  const { data: destinations } = useQuery<Destination[]>({
    queryKey: ['destinations'],
    queryFn: () => api.get('/destinations').then((r) => r.data),
  })

  const handleDelete = useCallback((nodeId: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId))
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId))
    setSelectedNodeId((prev) => (prev === nodeId ? null : prev))
  }, [])

  const triggerNode: Node = useMemo(
    () => ({
      id: TRIGGER_NODE_ID,
      type: 'trigger',
      position: { x: STEP_X, y: TRIGGER_Y },
      data: { events: pipeline?.trigger.events ?? [] } as TriggerNodeData,
      draggable: false,
      deletable: false,
    }),
    [pipeline?.trigger.events],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  useEffect(() => {
    if (!pipeline) return
    const stepNodes = stepsToNodes(pipeline.steps, handleDelete)
    setNodes([triggerNode, ...stepNodes])
    setEdges(stepsToEdges(TRIGGER_NODE_ID, pipeline.steps))
  }, [pipeline, triggerNode, handleDelete])

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge({ ...connection, style: { stroke: '#6366f1', strokeWidth: 2 } }, eds)),
    [setEdges],
  )

  const addStep = useCallback(
    (type: PipelineStep['type']) => {
      const newStep: PipelineStep = {
        id: crypto.randomUUID(),
        type,
        name: type.charAt(0).toUpperCase() + type.slice(1),
        config: defaultConfig(type),
      }

      setNodes((nds) => {
        const stepNodes = nds.filter((n) => n.id !== TRIGGER_NODE_ID)
        const maxY = stepNodes.reduce((m, n) => Math.max(m, n.position.y), TRIGGER_Y + STEP_GAP - STEP_GAP)
        return [
          ...nds,
          {
            id: newStep.id,
            type: 'step',
            position: { x: STEP_X, y: maxY + STEP_GAP },
            data: { step: newStep, onDelete: handleDelete, selected: false } as StepNodeData,
          },
        ]
      })

      setEdges((eds) => {
        const stepNodes = nodes.filter((n) => n.id !== TRIGGER_NODE_ID)
        const lastId = stepNodes.length > 0 ? stepNodes[stepNodes.length - 1].id : TRIGGER_NODE_ID
        return addEdge(
          { id: `e-${lastId}-${newStep.id}`, source: lastId, target: newStep.id, style: { stroke: '#6366f1', strokeWidth: 2 } },
          eds,
        )
      })
    },
    [nodes, setNodes, setEdges, handleDelete],
  )

  const updateNodeConfig = useCallback(
    (nodeId: string, config: Record<string, unknown>) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== nodeId || n.type !== 'step') return n
          const data = n.data as StepNodeData
          return { ...n, data: { ...data, step: { ...data.step, config } } }
        }),
      )
    },
    [setNodes],
  )

  const updateNodeName = useCallback(
    (nodeId: string, name: string) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== nodeId || n.type !== 'step') return n
          const data = n.data as StepNodeData
          return { ...n, data: { ...data, step: { ...data.step, name } } }
        }),
      )
    },
    [setNodes],
  )

  const saveMutation = useMutation({
    mutationFn: (steps: PipelineStep[]) =>
      api.put(`/pipelines/${id}`, { steps, destinations: steps.filter((s) => s.type === 'destination').map((s) => (s.config as { destinationId: string }).destinationId) }).then((r) => r.data),
    onSuccess: () => {
      setSaveError(null)
      navigate(`/pipelines/${id}`)
    },
    onError: () => setSaveError('Failed to save — please try again.'),
  })

  const handleSave = () => {
    const stepNodes = nodes
      .filter((n) => n.id !== TRIGGER_NODE_ID)
      .sort((a, b) => a.position.y - b.position.y)
    const steps = stepNodes.map((n) => (n.data as StepNodeData).step)
    saveMutation.mutate(steps)
  }

  const selectedNode = selectedNodeId
    ? (nodes.find((n) => n.id === selectedNodeId) ?? null)
    : null

  const selectedStep =
    selectedNode && selectedNode.type === 'step'
      ? (selectedNode.data as StepNodeData).step
      : null

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
      </div>
    )
  }

  if (error || !pipeline) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-sm text-red-500 mb-4">Failed to load pipeline.</p>
          <button
            onClick={() => navigate(`/pipelines/${id}`)}
            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
          >
            ← Back to pipeline
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      {/* Top bar */}
      <div className="shrink-0 h-14 bg-white border-b border-gray-200 flex items-center px-4 gap-4 z-10">
        <button
          onClick={() => navigate(`/pipelines/${id}`)}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">{pipeline.name}</span>
        </button>

        <div className="flex-1" />

        {saveError && <p className="text-xs text-red-500">{saveError}</p>}

        <button
          onClick={handleSave}
          disabled={saveMutation.isPending}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {saveMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Save
        </button>
      </div>

      {/* Builder body */}
      <div className="flex flex-1 min-h-0">
        {/* Left: step palette */}
        <StepPalette onAddStep={addStep} />

        {/* Centre: canvas */}
        <div className="flex-1 min-w-0">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            onNodeClick={(_, node) => setSelectedNodeId(node.id === TRIGGER_NODE_ID ? null : node.id)}
            onPaneClick={() => setSelectedNodeId(null)}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            minZoom={0.3}
            maxZoom={1.5}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e5e7eb" />
            <Controls showInteractive={false} />
            <Panel position="top-center">
              <p className="text-xs text-gray-400 bg-white/80 px-3 py-1 rounded-full border border-gray-200">
                Click a step to configure · Drag to rearrange · Connect nodes to set order
              </p>
            </Panel>
          </ReactFlow>
        </div>

        {/* Right: config panel */}
        <ConfigPanel
          step={selectedStep}
          destinations={destinations ?? []}
          onUpdateConfig={(config) => selectedNodeId && updateNodeConfig(selectedNodeId, config)}
          onUpdateName={(name) => selectedNodeId && updateNodeName(selectedNodeId, name)}
        />
      </div>
    </div>
  )
}

function defaultConfig(type: PipelineStep['type']): Record<string, unknown> {
  switch (type) {
    case 'filter':
      return { conditions: [{ field: '', operator: 'eq', value: '' }] }
    case 'transform':
      return { mappings: [{ from: '', to: '' }] }
    case 'enrich':
      return { properties: {} }
    case 'destination':
      return { destinationId: '' }
  }
}
