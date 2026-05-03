import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { GitBranch, ToggleLeft, ToggleRight, Trash2 } from 'lucide-react'
import type { Pipeline } from '@flowmesh/shared-types'
import api from '../../lib/api'
import { useToastContext } from '../../components/ui/ToastProvider'
import ConfirmModal from '../../components/ui/ConfirmModal'
import CreatePipelineModal from './CreatePipelineModal'

export default function PipelinesPage() {
  const { toast } = useToastContext()
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Pipeline | null>(null)

  const { data, isLoading, error } = useQuery<Pipeline[]>({
    queryKey: ['pipelines'],
    queryFn: () => api.get('/pipelines').then((r) => r.data),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.put(`/pipelines/${id}`, { enabled }).then((r) => r.data),
    onSuccess: (updated: Pipeline) => {
      queryClient.invalidateQueries({ queryKey: ['pipelines'] })
      toast({
        title: updated.enabled ? 'Pipeline enabled' : 'Pipeline disabled',
        variant: 'success',
      })
    },
    onError: () => toast({ title: 'Failed to update pipeline', variant: 'error' }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/pipelines/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipelines'] })
      toast({ title: 'Pipeline deleted', variant: 'success' })
      setDeleteTarget(null)
    },
    onError: () => {
      toast({ title: 'Failed to delete pipeline', variant: 'error' })
      setDeleteTarget(null)
    },
  })

  return (
    <>
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Pipelines</h1>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <GitBranch className="w-4 h-4" />
            Create Pipeline
          </button>
        </div>

        {isLoading && (
          <div className="text-sm text-gray-500 py-8 text-center">Loading...</div>
        )}

        {error && (
          <div className="text-sm text-red-500 py-8 text-center">
            Failed to load pipelines — please try again.
          </div>
        )}

        {data && data.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-12 text-center">
            <GitBranch className="w-8 h-8 text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-900 mb-1">No pipelines yet</p>
            <p className="text-sm text-gray-500">
              Create a pipeline to start routing events to destinations.
            </p>
          </div>
        )}

        {data && data.length > 0 && (
          <div className="space-y-3">
            {data.map((pipeline) => (
              <div
                key={pipeline.id}
                className="bg-white border border-gray-200 rounded-lg shadow-sm px-5 py-4 flex items-center gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {pipeline.name}
                    </span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        pipeline.enabled
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {pipeline.enabled ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  {pipeline.description && (
                    <p className="text-xs text-gray-500 mb-2 truncate">{pipeline.description}</p>
                  )}

                  <div className="flex flex-wrap gap-1">
                    {pipeline.trigger.events.map((event) => (
                      <span
                        key={event}
                        className="inline-block px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs font-mono rounded-full border border-indigo-200"
                      >
                        {event}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-xs text-gray-400 mr-2">
                    {pipeline.steps.length} step{pipeline.steps.length !== 1 ? 's' : ''}
                  </span>

                  <button
                    onClick={() =>
                      toggleMutation.mutate({ id: pipeline.id, enabled: !pipeline.enabled })
                    }
                    disabled={toggleMutation.isPending}
                    aria-label={pipeline.enabled ? 'Disable pipeline' : 'Enable pipeline'}
                    className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50"
                  >
                    {pipeline.enabled ? (
                      <ToggleRight className="w-5 h-5 text-indigo-600" />
                    ) : (
                      <ToggleLeft className="w-5 h-5" />
                    )}
                  </button>

                  <button
                    onClick={() => setDeleteTarget(pipeline)}
                    aria-label={`Delete pipeline ${pipeline.name}`}
                    className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <CreatePipelineModal open={showCreate} onClose={() => setShowCreate(false)} />

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete Pipeline"
        description={`Delete "${deleteTarget?.name}"? This cannot be undone. Any events matching this pipeline's triggers will no longer be processed.`}
        confirmLabel="Delete"
        variant="danger"
        isPending={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  )
}
