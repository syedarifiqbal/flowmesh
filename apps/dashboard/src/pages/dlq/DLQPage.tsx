import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Inbox, RotateCcw, AlertTriangle } from 'lucide-react'
import api from '../../lib/api'
import { useToast } from '../../hooks/useToast'

interface DLQEvent {
  id: string
  eventId: string
  correlationId: string
  eventName: string
  source: string
  destinationId: string
  destinationType: string
  errorReason: string
  attempts: number
  createdAt: string
  replayedAt: string | null
  resolvedAt: string | null
}

interface DLQResponse {
  events: DLQEvent[]
  total: number
  limit: number
  offset: number
}

const PAGE_SIZE = 50

function StatusBadge({ replayedAt, resolvedAt }: { replayedAt: string | null; resolvedAt: string | null }) {
  if (resolvedAt) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
        Resolved
      </span>
    )
  }
  if (replayedAt) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
        Replayed
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
      Failed
    </span>
  )
}

export default function DLQPage() {
  const [offset, setOffset] = useState(0)
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data, isLoading } = useQuery<DLQResponse>({
    queryKey: ['dlq', offset],
    queryFn: () =>
      api.get<DLQResponse>(`/dlq?limit=${PAGE_SIZE}&offset=${offset}`).then((r) => r.data),
  })

  const replayMutation = useMutation({
    mutationFn: (id: string) => api.post(`/dlq/${id}/replay`),
    onSuccess: () => {
      toast({ title: 'Event queued for replay', variant: 'success' })
      queryClient.invalidateQueries({ queryKey: ['dlq'] })
    },
    onError: () => {
      toast({ title: 'Replay failed — check delivery service logs', variant: 'error' })
    },
  })

  const events = data?.events ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Dead Letter Queue</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Events that failed delivery after all retry attempts
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Inbox className="w-4 h-4 text-indigo-600" />
            <h2 className="text-sm font-semibold text-gray-900">Failed events</h2>
            {!isLoading && (
              <span className="text-xs text-gray-400">{total.toLocaleString()} total</span>
            )}
          </div>
        </div>

        {isLoading && (
          <div className="divide-y divide-gray-100">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 px-6 py-4 flex items-center">
                <div className="h-4 bg-gray-100 rounded animate-pulse w-full" />
              </div>
            ))}
          </div>
        )}

        {!isLoading && events.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <AlertTriangle className="w-8 h-8 mb-3 text-gray-300" />
            <p className="text-sm">No failed events — all deliveries succeeded.</p>
          </div>
        )}

        {!isLoading && events.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left">
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Event</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Destination</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Error</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Attempts</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Time</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {events.map((event) => (
                  <tr key={event.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3">
                      <p className="font-medium text-gray-800 truncate max-w-[180px]">{event.eventName || '—'}</p>
                      <p className="text-xs text-gray-400 truncate max-w-[180px]">{event.source || '—'}</p>
                    </td>
                    <td className="px-6 py-3">
                      <p className="text-gray-700 truncate max-w-[140px]">{event.destinationType}</p>
                      <p className="text-xs text-gray-400 font-mono truncate max-w-[140px]">{event.destinationId}</p>
                    </td>
                    <td className="px-6 py-3">
                      <p className="text-red-600 truncate max-w-[200px]" title={event.errorReason}>
                        {event.errorReason}
                      </p>
                    </td>
                    <td className="px-6 py-3 text-gray-600">{event.attempts}</td>
                    <td className="px-6 py-3 text-gray-500 whitespace-nowrap">
                      {new Date(event.createdAt).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="px-6 py-3">
                      <StatusBadge replayedAt={event.replayedAt} resolvedAt={event.resolvedAt} />
                    </td>
                    <td className="px-6 py-3 text-right">
                      <button
                        onClick={() => replayMutation.mutate(event.id)}
                        disabled={replayMutation.isPending}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                      >
                        <RotateCcw className="w-3 h-3" />
                        {event.replayedAt ? 'Replay again' : 'Replay'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
            <p className="text-xs text-gray-500">
              Page {currentPage} of {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                disabled={offset === 0}
                className="px-3 py-1 text-xs font-medium border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                onClick={() => setOffset(offset + PAGE_SIZE)}
                disabled={offset + PAGE_SIZE >= total}
                className="px-3 py-1 text-xs font-medium border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
