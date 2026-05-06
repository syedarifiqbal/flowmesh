import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Share2, Trash2, ExternalLink, CheckCircle, XCircle, Clock, FlaskConical, Pencil } from 'lucide-react'
import api from '../../lib/api'
import { useToastContext } from '../../components/ui/ToastProvider'
import ConfirmModal from '../../components/ui/ConfirmModal'
import CreateDestinationModal from './CreateDestinationModal'
import EditDestinationModal from './EditDestinationModal'

interface Destination {
  id: string
  name: string
  type: string
  status: 'untested' | 'verified' | 'failed'
  config: Record<string, string>
  createdAt: string
}

function StatusBadge({ status }: { status: Destination['status'] }) {
  if (status === 'verified') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-green-50 text-green-700 rounded-full border border-green-200">
        <CheckCircle className="w-3 h-3" />
        verified
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
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-gray-50 text-gray-500 rounded-full border border-gray-200">
      <Clock className="w-3 h-3" />
      untested
    </span>
  )
}

export default function DestinationsPage() {
  const { toast } = useToastContext()
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [editTarget, setEditTarget] = useState<Destination | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Destination | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testError, setTestError] = useState<Record<string, string>>({})

  const { data, isLoading, error } = useQuery<Destination[]>({
    queryKey: ['destinations'],
    queryFn: () => api.get('/destinations').then((r) => r.data),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/destinations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['destinations'] })
      toast({ title: 'Destination deleted', variant: 'success' })
      setDeleteTarget(null)
    },
    onError: () => {
      toast({ title: 'Failed to delete destination', variant: 'error' })
      setDeleteTarget(null)
    },
  })

  async function handleTest(dest: Destination) {
    setTestingId(dest.id)
    setTestError((prev) => ({ ...prev, [dest.id]: '' }))
    try {
      await api.post(`/destinations/${dest.id}/test`)
      queryClient.invalidateQueries({ queryKey: ['destinations'] })
      toast({ title: `${dest.name} — connection verified`, variant: 'success' })
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Connection test failed'
      setTestError((prev) => ({ ...prev, [dest.id]: msg }))
      queryClient.invalidateQueries({ queryKey: ['destinations'] })
      toast({ title: `${dest.name} — test failed`, variant: 'error' })
    } finally {
      setTestingId(null)
    }
  }

  return (
    <>
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Destinations</h1>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Share2 className="w-4 h-4" />
            Add Destination
          </button>
        </div>

        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-36 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        )}

        {error && (
          <div className="text-sm text-red-500 py-8 text-center">
            Failed to load destinations — please try again.
          </div>
        )}

        {data && data.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-12 text-center">
            <Share2 className="w-8 h-8 text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-900 mb-1">No destinations yet</p>
            <p className="text-sm text-gray-500">
              Add a webhook or PostgreSQL destination to start delivering events.
            </p>
          </div>
        )}

        {data && data.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.map((dest) => (
              <div
                key={dest.id}
                className="bg-white border border-gray-200 rounded-lg shadow-sm p-5 flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{dest.name}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs font-medium rounded-full border border-indigo-200">
                        {dest.type}
                      </span>
                      <StatusBadge status={dest.status} />
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setEditTarget(dest)}
                      aria-label={`Edit destination ${dest.name}`}
                      className="p-1.5 rounded-md text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(dest)}
                      aria-label={`Delete destination ${dest.name}`}
                      className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {dest.config?.url && (
                  <div className="flex items-center gap-1.5 min-w-0">
                    <ExternalLink className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <span className="text-xs text-gray-500 truncate font-mono">
                      {dest.config.url}
                    </span>
                  </div>
                )}

                {testError[dest.id] && (
                  <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5 leading-snug">
                    {testError[dest.id]}
                  </p>
                )}

                <div className="flex items-center justify-between mt-auto pt-1">
                  <p className="text-xs text-gray-400">
                    Added {new Date(dest.createdAt).toLocaleDateString()}
                  </p>
                  <button
                    onClick={() => handleTest(dest)}
                    disabled={testingId === dest.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <FlaskConical className="w-3.5 h-3.5" />
                    {testingId === dest.id ? 'Testing…' : 'Test'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <CreateDestinationModal open={showCreate} onClose={() => setShowCreate(false)} />

      <EditDestinationModal destination={editTarget} onClose={() => setEditTarget(null)} />

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete Destination"
        description={`Delete "${deleteTarget?.name}"? Any pipelines using this destination will stop delivering events to it.`}
        confirmLabel="Delete"
        variant="danger"
        isPending={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  )
}
