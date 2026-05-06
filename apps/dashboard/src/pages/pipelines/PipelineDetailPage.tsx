import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, GitBranch, Share2, X, Plus, Activity, CheckCircle, XCircle, Clock } from 'lucide-react'
import api from '../../lib/api'
import { useToastContext } from '../../components/ui/ToastProvider'
import AddDestinationModal from './AddDestinationModal'

interface Destination {
  id: string
  name: string
  type: string
  config: Record<string, string>
}

interface PipelineStep {
  id: string
  name: string
  type: string
  config: Record<string, unknown>
}

interface Pipeline {
  id: string
  name: string
  description?: string
  enabled: boolean
  trigger: { type: string; events: string[] }
  steps: PipelineStep[]
  destinations: string[]
}

interface Execution {
  id: string
  pipelineId: string
  eventId: string
  status: 'running' | 'completed' | 'failed'
  startedAt: string
  completedAt: string | null
  error: string | null
}

interface ExecutionsResponse {
  executions: Execution[]
  total: number
  limit: number
  offset: number
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return new Date(iso).toLocaleDateString()
}

function formatDuration(start: string, end: string | null): string {
  if (!end) return '—'
  const ms = new Date(end).getTime() - new Date(start).getTime()
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function StatusBadge({ status }: { status: Execution['status'] }) {
  if (status === 'completed') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-green-50 text-green-700 rounded-full border border-green-200">
        <CheckCircle className="w-3 h-3" />
        completed
      </span>
    )
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-red-50 text-red-700 rounded-full border border-red-200">
        <XCircle className="w-3 h-3" />
        failed
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-yellow-50 text-yellow-700 rounded-full border border-yellow-200">
      <Clock className="w-3 h-3" />
      running
    </span>
  )
}

export default function PipelineDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToastContext()
  const queryClient = useQueryClient()
  const [showAddDest, setShowAddDest] = useState(false)
  const [execOffset, setExecOffset] = useState(0)
  const execLimit = 20

  const { data: pipeline, isLoading, error } = useQuery<Pipeline>({
    queryKey: ['pipeline', id],
    queryFn: () => api.get(`/pipelines/${id}`).then((r) => r.data),
    enabled: !!id,
  })

  const { data: allDestinations } = useQuery<Destination[]>({
    queryKey: ['destinations'],
    queryFn: () => api.get('/destinations').then((r) => r.data),
  })

  const { data: executionsData, isLoading: execLoading } = useQuery<ExecutionsResponse>({
    queryKey: ['executions', id, execOffset],
    queryFn: () =>
      api
        .get(`/executions?pipelineId=${id}&limit=${execLimit}&offset=${execOffset}`)
        .then((r) => r.data),
    enabled: !!id,
    refetchInterval: 15000,
  })

  const removeDestMutation = useMutation({
    mutationFn: (destId: string) =>
      api
        .put(`/pipelines/${id}`, {
          destinations: (pipeline?.destinations ?? []).filter((d) => d !== destId),
          steps: (pipeline?.steps ?? []).filter(
            (s) => !(s.type === 'destination' && (s.config as Record<string, unknown>).destinationId === destId),
          ),
        })
        .then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline', id] })
      toast({ title: 'Destination removed', variant: 'success' })
    },
    onError: () => {
      toast({ title: 'Failed to remove destination', variant: 'error' })
    },
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-48 bg-gray-100 rounded animate-pulse" />
        <div className="h-32 bg-gray-100 rounded-lg animate-pulse" />
        <div className="h-48 bg-gray-100 rounded-lg animate-pulse" />
      </div>
    )
  }

  if (error || !pipeline) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-red-500 mb-4">Failed to load pipeline.</p>
        <button
          onClick={() => navigate('/pipelines')}
          className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
        >
          ← Back to Pipelines
        </button>
      </div>
    )
  }

  const attachedDestinations = (allDestinations ?? []).filter((d) =>
    (pipeline.destinations ?? []).includes(d.id),
  )

  const executions = executionsData?.executions ?? []
  const execTotal = executionsData?.total ?? 0
  const execPages = Math.ceil(execTotal / execLimit)
  const execCurrentPage = Math.floor(execOffset / execLimit) + 1

  return (
    <>
      <div className="space-y-6">
        <div>
          <Link
            to="/pipelines"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Pipelines
          </Link>

          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-gray-900">{pipeline.name}</h1>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                pipeline.enabled
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-500'
              }`}
            >
              {pipeline.enabled ? 'Active' : 'Inactive'}
            </span>
          </div>

          {pipeline.description && (
            <p className="text-sm text-gray-500 mt-1">{pipeline.description}</p>
          )}
        </div>

        {/* Trigger events */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <GitBranch className="w-4 h-4 text-indigo-600" />
            <h2 className="text-sm font-semibold text-gray-900">Trigger Events</h2>
          </div>

          {pipeline.trigger.events.length === 0 ? (
            <p className="text-sm text-gray-400">No trigger events configured.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {pipeline.trigger.events.map((event) => (
                <span
                  key={event}
                  className="inline-block px-2.5 py-1 bg-indigo-50 text-indigo-700 text-xs font-mono rounded-full border border-indigo-200"
                >
                  {event}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Destinations */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Share2 className="w-4 h-4 text-indigo-600" />
              <h2 className="text-sm font-semibold text-gray-900">Destinations</h2>
            </div>
            <button
              onClick={() => setShowAddDest(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 border border-indigo-300 rounded-lg hover:bg-indigo-50 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add destination
            </button>
          </div>

          {attachedDestinations.length === 0 ? (
            <div className="text-center py-6 border border-dashed border-gray-200 rounded-lg">
              <Share2 className="w-6 h-6 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500 mb-1">No destinations attached</p>
              <p className="text-xs text-gray-400">
                Events matched by this pipeline will not be delivered anywhere.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {attachedDestinations.map((dest) => (
                <div
                  key={dest.id}
                  className="flex items-center gap-3 px-4 py-3 border border-gray-200 rounded-lg"
                >
                  <Share2 className="w-4 h-4 text-indigo-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{dest.name}</p>
                    {dest.config?.url && (
                      <p className="text-xs text-gray-500 font-mono truncate">{dest.config?.url}</p>
                    )}
                  </div>
                  <span className="shrink-0 px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs font-medium rounded-full border border-indigo-200">
                    {dest.type}
                  </span>
                  <button
                    onClick={() => removeDestMutation.mutate(dest.id)}
                    disabled={removeDestMutation.isPending}
                    aria-label={`Remove destination ${dest.name}`}
                    className="shrink-0 p-1 text-gray-400 hover:text-red-600 rounded transition-colors disabled:opacity-50"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Execution history */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-indigo-600" />
              <h2 className="text-sm font-semibold text-gray-900">Execution History</h2>
            </div>
            {execTotal > 0 && (
              <span className="text-xs text-gray-400">
                {execTotal.toLocaleString()} run{execTotal !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {execLoading ? (
            <div className="py-10 text-center text-sm text-gray-400">Loading executions…</div>
          ) : executions.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-gray-500">No executions yet.</p>
              <p className="text-xs text-gray-400 mt-1">
                Send an event matching one of the trigger events above to see runs here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    <th className="px-6 py-2">Status</th>
                    <th className="px-6 py-2">Event ID</th>
                    <th className="px-6 py-2">Duration</th>
                    <th className="px-6 py-2">Started</th>
                    <th className="px-6 py-2">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {executions.map((exec) => (
                    <tr
                      key={exec.id}
                      onClick={() => navigate(`/executions/${exec.id}`)}
                      className="hover:bg-gray-50 cursor-pointer"
                    >
                      <td className="px-6 py-3">
                        <StatusBadge status={exec.status} />
                      </td>
                      <td className="px-6 py-3 text-xs font-mono text-gray-500 max-w-[180px] truncate">
                        {exec.eventId}
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-600">
                        {formatDuration(exec.startedAt, exec.completedAt)}
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-500 whitespace-nowrap">
                        {formatRelative(exec.startedAt)}
                      </td>
                      <td className="px-6 py-3 text-xs text-red-600 max-w-[200px] truncate">
                        {exec.error ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {execPages > 1 && (
            <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-500">
                Page {execCurrentPage} of {execPages}
              </span>
              <div className="flex gap-2">
                <button
                  disabled={execOffset === 0}
                  onClick={() => setExecOffset(Math.max(0, execOffset - execLimit))}
                  className="px-3 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  disabled={execOffset + execLimit >= execTotal}
                  onClick={() => setExecOffset(execOffset + execLimit)}
                  className="px-3 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <AddDestinationModal
        open={showAddDest}
        pipelineId={pipeline.id}
        attachedIds={pipeline.destinations}
        currentSteps={pipeline.steps}
        onClose={() => setShowAddDest(false)}
      />
    </>
  )
}
