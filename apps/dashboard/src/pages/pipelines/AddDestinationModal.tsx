import { useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Share2, ExternalLink, AlertTriangle } from 'lucide-react'
import api from '../../lib/api'
import { useToastContext } from '../../components/ui/ToastProvider'

interface Destination {
  id: string
  name: string
  type: string
  status: 'untested' | 'verified' | 'failed'
  config: Record<string, string>
}

interface PipelineStep {
  id: string
  name: string
  type: string
  config: Record<string, unknown>
}

interface Props {
  open: boolean
  pipelineId: string
  attachedIds: string[] | undefined
  currentSteps: PipelineStep[]
  onClose: () => void
}

export default function AddDestinationModal({ open, pipelineId, attachedIds, currentSteps, onClose }: Props) {
  const { toast } = useToastContext()
  const queryClient = useQueryClient()
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  const { data: allDestinations, isLoading } = useQuery<Destination[]>({
    queryKey: ['destinations'],
    queryFn: () => api.get('/destinations').then((r) => r.data),
    enabled: open,
  })

  const addMutation = useMutation({
    mutationFn: (dest: Destination) =>
      api
        .put(`/pipelines/${pipelineId}`, {
          destinations: [...(attachedIds ?? []), dest.id],
          steps: [
            ...currentSteps,
            {
              id: crypto.randomUUID(),
              name: dest.name,
              type: 'destination',
              config: { destinationId: dest.id },
            },
          ],
        })
        .then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline', pipelineId] })
      toast({ title: 'Destination added', variant: 'success' })
      onClose()
    },
    onError: () => {
      toast({ title: 'Failed to add destination', variant: 'error' })
    },
  })

  if (!open) return null

  const available = (allDestinations ?? []).filter((d) => !(attachedIds ?? []).includes(d.id))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-dest-title"
      >
        <h2 id="add-dest-title" className="text-base font-semibold text-gray-900 mb-4">
          Add Destination
        </h2>

        {isLoading && (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        )}

        {!isLoading && available.length === 0 && (
          <div className="text-center py-6">
            <Share2 className="w-8 h-8 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-600 mb-3">No destinations available to add.</p>
            <Link
              to="/destinations"
              onClick={onClose}
              className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
            >
              Create a destination first →
            </Link>
          </div>
        )}

        {!isLoading && available.length > 0 && (
          <div className="space-y-2">
            {available.map((dest) => (
              <button
                key={dest.id}
                onClick={() => addMutation.mutate(dest)}
                disabled={addMutation.isPending}
                className="w-full flex items-start gap-3 p-3 rounded-lg border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 transition-colors text-left disabled:opacity-50"
              >
                <Share2 className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">{dest.name}</p>
                  {dest.config?.url && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <ExternalLink className="w-3 h-3 text-gray-400 shrink-0" />
                      <span className="text-xs text-gray-500 truncate font-mono">
                        {dest.config?.url}
                      </span>
                    </div>
                  )}
                </div>
                <div className="ml-auto flex items-center gap-1.5 shrink-0">
                  {dest.status !== 'verified' && (
                    <span title={dest.status === 'failed' ? 'Connection test failed' : 'Not yet tested'}>
                      <AlertTriangle className={`w-3.5 h-3.5 ${dest.status === 'failed' ? 'text-red-400' : 'text-amber-400'}`} />
                    </span>
                  )}
                  <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs font-medium rounded-full border border-indigo-200">
                    {dest.type}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="flex justify-end mt-5">
          <button
            ref={closeRef}
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
