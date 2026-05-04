import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, GitBranch, Share2, X, Plus } from 'lucide-react'
import api from '../../lib/api'
import { useToastContext } from '../../components/ui/ToastProvider'
import AddDestinationModal from './AddDestinationModal'

interface Destination {
  id: string
  name: string
  type: string
  config: Record<string, string>
}

interface Pipeline {
  id: string
  name: string
  description?: string
  enabled: boolean
  trigger: { type: string; events: string[] }
  steps: unknown[]
  destinations: string[]
}

export default function PipelineDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToastContext()
  const queryClient = useQueryClient()
  const [showAddDest, setShowAddDest] = useState(false)

  const { data: pipeline, isLoading, error } = useQuery<Pipeline>({
    queryKey: ['pipeline', id],
    queryFn: () => api.get(`/pipelines/${id}`).then((r) => r.data),
    enabled: !!id,
  })

  const { data: allDestinations } = useQuery<Destination[]>({
    queryKey: ['destinations'],
    queryFn: () => api.get('/destinations').then((r) => r.data),
  })

  const removeDestMutation = useMutation({
    mutationFn: (destId: string) =>
      api
        .put(`/pipelines/${id}`, {
          destinations: (pipeline?.destinations ?? []).filter((d) => d !== destId),
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
      </div>

      <AddDestinationModal
        open={showAddDest}
        pipelineId={pipeline.id}
        attachedIds={pipeline.destinations}
        onClose={() => setShowAddDest(false)}
      />
    </>
  )
}
