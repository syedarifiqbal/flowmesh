import { useQueries } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { GitBranch, Key, ArrowRight, Zap, Share2, CheckCircle } from 'lucide-react'
import type { Pipeline } from '@flowmesh/shared-types'
import api from '../../lib/api'
import ErrorRateChart from '../../components/ui/ErrorRateChart'

interface ApiKey {
  id: string
  revokedAt: string | null
}

function StatCard({
  label,
  value,
  isLoading,
}: {
  label: string
  value: number | string
  isLoading: boolean
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-5">
      <p className="text-sm font-medium text-gray-500 mb-2">{label}</p>
      {isLoading ? (
        <div className="h-8 w-12 bg-gray-100 rounded animate-pulse" />
      ) : (
        <p className="text-3xl font-bold text-gray-900">{value}</p>
      )}
    </div>
  )
}

function QuickStartStep({
  done,
  label,
  to,
  cta,
}: {
  done: boolean
  label: string
  to: string
  cta: string
}) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-gray-100 last:border-0">
      <div
        className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
          done ? 'bg-green-100' : 'bg-gray-100'
        }`}
      >
        {done ? (
          <CheckCircle className="w-4 h-4 text-green-600" />
        ) : (
          <span className="w-2 h-2 rounded-full bg-gray-400" />
        )}
      </div>
      <p className={`flex-1 text-sm ${done ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
        {label}
      </p>
      {!done && (
        <Link
          to={to}
          className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
        >
          {cta}
          <ArrowRight className="w-3 h-3" />
        </Link>
      )}
    </div>
  )
}

interface Destination {
  id: string
}

export default function DashboardPage() {
  const workspaceName = localStorage.getItem('workspace_name') ?? 'My Workspace'

  const [pipelinesQuery, apiKeysQuery, destinationsQuery, eventsQuery] = useQueries({
    queries: [
      {
        queryKey: ['pipelines'],
        queryFn: () => api.get<Pipeline[]>('/pipelines').then((r) => r.data),
      },
      {
        queryKey: ['api-keys'],
        queryFn: () => api.get<ApiKey[]>('/api-keys').then((r) => r.data),
      },
      {
        queryKey: ['destinations'],
        queryFn: () => api.get<Destination[]>('/destinations').then((r) => r.data),
      },
      {
        queryKey: ['events-count'],
        queryFn: () =>
          api.get<{ total: number }>('/events?limit=1').then((r) => r.data),
        refetchInterval: 30000,
      },
    ],
  })

  const pipelines = pipelinesQuery.data ?? []
  const apiKeys = (apiKeysQuery.data ?? []).filter((k) => !k.revokedAt)
  const destinations = destinationsQuery.data ?? []
  const totalEvents = eventsQuery.data?.total ?? 0
  const isLoading = pipelinesQuery.isLoading || apiKeysQuery.isLoading || destinationsQuery.isLoading

  const activePipelines = pipelines.filter((p) => p.enabled).length
  const totalPipelines = pipelines.length
  const totalApiKeys = apiKeys.length
  const totalDestinations = destinations.length

  const hasApiKey = totalApiKeys > 0
  const hasDestination = totalDestinations > 0
  const hasPipeline = totalPipelines > 0
  const hasActivePipeline = activePipelines > 0
  const allDone = hasApiKey && hasDestination && hasPipeline && hasActivePipeline

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">{workspaceName}</h1>
        <p className="text-sm text-gray-500 mt-0.5">Overview of your event pipeline</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
        <StatCard label="Total Pipelines" value={totalPipelines} isLoading={isLoading} />
        <StatCard label="Active Pipelines" value={activePipelines} isLoading={isLoading} />
        <StatCard label="Destinations" value={totalDestinations} isLoading={isLoading} />
        <StatCard label="API Keys" value={totalApiKeys} isLoading={isLoading} />
        <StatCard label="Events Ingested" value={totalEvents.toLocaleString()} isLoading={eventsQuery.isLoading} />
      </div>

      <ErrorRateChart />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {!allDone && (
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-4 h-4 text-indigo-600" />
              <h2 className="text-sm font-semibold text-gray-900">Quick start</h2>
            </div>
            <div>
              <QuickStartStep
                done={hasApiKey}
                label="Create an API key to authenticate event ingestion"
                to="/api-keys"
                cta="Create key"
              />
              <QuickStartStep
                done={hasDestination}
                label="Add a destination to deliver events to"
                to="/destinations"
                cta="Add destination"
              />
              <QuickStartStep
                done={hasPipeline}
                label="Create a pipeline to route events to destinations"
                to="/pipelines"
                cta="Create pipeline"
              />
              <QuickStartStep
                done={hasActivePipeline}
                label="Enable at least one pipeline to start processing events"
                to="/pipelines"
                cta="View pipelines"
              />
            </div>
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-indigo-600" />
              <h2 className="text-sm font-semibold text-gray-900">Pipelines</h2>
            </div>
            <Link
              to="/pipelines"
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
            >
              View all
            </Link>
          </div>

          {isLoading && (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="h-10 bg-gray-50 rounded animate-pulse" />
              ))}
            </div>
          )}

          {!isLoading && pipelines.length === 0 && (
            <p className="text-sm text-gray-400">No pipelines yet.</p>
          )}

          {!isLoading && pipelines.length > 0 && (
            <div className="space-y-2">
              {pipelines.slice(0, 5).map((p) => (
                <div key={p.id} className="flex items-center justify-between py-1.5">
                  <span className="text-sm text-gray-800 truncate flex-1">{p.name}</span>
                  <span
                    className={`ml-3 text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                      p.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {p.enabled ? 'Active' : 'Inactive'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-indigo-600" />
              <h2 className="text-sm font-semibold text-gray-900">API Keys</h2>
            </div>
            <Link
              to="/api-keys"
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
            >
              View all
            </Link>
          </div>

          {isLoading && (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="h-10 bg-gray-50 rounded animate-pulse" />
              ))}
            </div>
          )}

          {!isLoading && apiKeys.length === 0 && (
            <p className="text-sm text-gray-400">No API keys yet.</p>
          )}

          {!isLoading && apiKeys.length > 0 && (
            <div className="space-y-2">
              {apiKeys.slice(0, 5).map((k: ApiKey & { name?: string; keyPrefix?: string }) => (
                <div key={k.id} className="flex items-center gap-3 py-1.5">
                  <Share2 className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  <span className="text-sm text-gray-800 truncate">
                    {k.name ?? k.keyPrefix ?? k.id}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
