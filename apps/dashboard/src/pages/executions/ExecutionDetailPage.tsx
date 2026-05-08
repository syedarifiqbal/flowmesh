import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Activity, CheckCircle, XCircle, Clock, GitBranch } from 'lucide-react'
import api from '../../lib/api'

interface Execution {
  id: string
  pipelineId: string
  eventId: string
  messageId: string
  status: 'running' | 'completed' | 'failed'
  startedAt: string
  completedAt: string | null
  error: string | null
  workspaceId: string
}

interface Pipeline {
  id: string
  name: string
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
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
      <span className="inline-flex items-center gap-1.5 px-3 py-1 text-sm font-medium bg-green-50 text-green-700 rounded-full border border-green-200">
        <CheckCircle className="w-4 h-4" />
        Completed
      </span>
    )
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 text-sm font-medium bg-red-50 text-red-700 rounded-full border border-red-200">
        <XCircle className="w-4 h-4" />
        Failed
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 text-sm font-medium bg-yellow-50 text-yellow-700 rounded-full border border-yellow-200">
      <Clock className="w-4 h-4" />
      Running
    </span>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-4 sm:grid sm:grid-cols-3 sm:gap-4">
      <dt className="text-sm font-medium text-gray-500">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{children}</dd>
    </div>
  )
}

export default function ExecutionDetailPage() {
  const { id } = useParams<{ id: string }>()

  const { data: execution, isLoading, error } = useQuery<Execution>({
    queryKey: ['execution', id],
    queryFn: () => api.get(`/executions/${id}`).then((r) => r.data),
    enabled: !!id,
    refetchInterval: (query) => (query.state.data?.status === 'running' ? 3000 : false),
  })

  const { data: pipeline } = useQuery<Pipeline>({
    queryKey: ['pipeline', execution?.pipelineId],
    queryFn: () => api.get(`/pipelines/${execution!.pipelineId}`).then((r) => r.data),
    enabled: !!execution?.pipelineId,
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-48 bg-gray-100 rounded animate-pulse" />
        <div className="h-64 bg-gray-100 rounded-lg animate-pulse" />
      </div>
    )
  }

  if (error || !execution) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-red-500 mb-4">Failed to load execution.</p>
        <Link to="/pipelines" className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">
          ← Back to Pipelines
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          to={`/pipelines/${execution.pipelineId}`}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          {pipeline?.name ?? 'Pipeline'}
        </Link>

        <div className="flex items-center gap-3">
          <Activity className="w-5 h-5 text-indigo-600" />
          <h1 className="text-2xl font-semibold text-gray-900">Execution</h1>
          <StatusBadge status={execution.status} />
        </div>
        <p className="text-sm text-gray-400 font-mono mt-1">{execution.id}</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
          <Activity className="w-4 h-4 text-indigo-600" />
          <h2 className="text-sm font-semibold text-gray-900">Execution Details</h2>
        </div>

        <dl className="divide-y divide-gray-100 px-6">
          <Field label="Status">
            <StatusBadge status={execution.status} />
          </Field>

          <Field label="Pipeline">
            {pipeline ? (
              <Link
                to={`/pipelines/${execution.pipelineId}`}
                className="inline-flex items-center gap-1.5 text-indigo-600 hover:text-indigo-800 font-medium"
              >
                <GitBranch className="w-3.5 h-3.5" />
                {pipeline.name}
              </Link>
            ) : (
              <span className="font-mono text-gray-500">{execution.pipelineId}</span>
            )}
          </Field>

          <Field label="Event ID">
            <span className="font-mono text-gray-700">{execution.eventId}</span>
          </Field>

          <Field label="Message ID">
            <span className="font-mono text-gray-500 text-xs">{execution.messageId}</span>
          </Field>

          <Field label="Started">
            {formatDateTime(execution.startedAt)}
          </Field>

          <Field label="Completed">
            {execution.completedAt ? formatDateTime(execution.completedAt) : <span className="text-gray-400">—</span>}
          </Field>

          <Field label="Duration">
            <span className="font-mono">{formatDuration(execution.startedAt, execution.completedAt)}</span>
          </Field>
        </dl>
      </div>

      {execution.error && (
        <div className="bg-red-50 border border-red-200 rounded-lg shadow-sm">
          <div className="px-6 py-4 border-b border-red-100 flex items-center gap-2">
            <XCircle className="w-4 h-4 text-red-600" />
            <h2 className="text-sm font-semibold text-red-700">Error</h2>
          </div>
          <pre className="px-6 py-4 text-sm text-red-700 whitespace-pre-wrap break-all font-mono">
            {execution.error}
          </pre>
        </div>
      )}
    </div>
  )
}
