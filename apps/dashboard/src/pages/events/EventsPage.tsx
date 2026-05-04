import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, ChevronDown, ChevronRight, RefreshCw, Zap } from 'lucide-react'
import api from '../../lib/api'

interface Event {
  id: string
  eventId: string
  correlationId: string
  eventName: string
  source: string
  version: string
  userId: string | null
  anonymousId: string | null
  properties: Record<string, unknown>
  receivedAt: string
}

interface EventsResponse {
  events: Event[]
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

function EventRow({ event }: { event: Event }) {
  const [expanded, setExpanded] = useState(false)
  const hasProperties = event.properties && Object.keys(event.properties).length > 0

  return (
    <>
      <tr
        className="hover:bg-gray-50 cursor-pointer select-none"
        onClick={() => setExpanded((e) => !e)}
      >
        <td className="px-4 py-3 w-6">
          {hasProperties ? (
            expanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
            )
          ) : (
            <span className="w-3.5 h-3.5 block" />
          )}
        </td>
        <td className="px-4 py-3">
          <span className="text-xs font-mono bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded">
            {event.eventName}
          </span>
        </td>
        <td className="px-4 py-3 text-sm text-gray-600">{event.source}</td>
        <td className="px-4 py-3 text-sm text-gray-500">
          {event.userId ?? event.anonymousId ?? '—'}
        </td>
        <td className="px-4 py-3 text-xs font-mono text-gray-400 max-w-[160px] truncate">
          {event.correlationId}
        </td>
        <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
          {formatRelative(event.receivedAt)}
        </td>
      </tr>
      {expanded && hasProperties && (
        <tr className="bg-gray-50 border-b border-gray-100">
          <td />
          <td colSpan={5} className="px-4 pb-3 pt-0">
            <pre className="bg-gray-900 text-gray-100 text-xs font-mono rounded-lg p-3 overflow-x-auto leading-relaxed max-h-56">
              {JSON.stringify(event.properties, null, 2)}
            </pre>
          </td>
        </tr>
      )}
    </>
  )
}

export default function EventsPage() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const limit = 50

  function handleSearch(value: string) {
    setSearch(value)
    clearTimeout((handleSearch as unknown as { timer?: ReturnType<typeof setTimeout> }).timer)
    ;(handleSearch as unknown as { timer?: ReturnType<typeof setTimeout> }).timer = setTimeout(() => {
      setDebouncedSearch(value)
      setOffset(0)
    }, 400)
  }

  const { data, isLoading, error, refetch, isFetching } = useQuery<EventsResponse>({
    queryKey: ['events', debouncedSearch, offset],
    queryFn: () => {
      const params = new URLSearchParams()
      params.set('limit', String(limit))
      params.set('offset', String(offset))
      if (debouncedSearch) params.set('search', debouncedSearch)
      return api.get<EventsResponse>(`/events?${params}`).then((r) => r.data)
    },
    refetchInterval: 10000,
  })

  const events = data?.events ?? []
  const total = data?.total ?? 0
  const pages = Math.ceil(total / limit)
  const currentPage = Math.floor(offset / limit) + 1

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Events</h1>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input
            type="text"
            placeholder="Search by event name, source, or correlation ID…"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="flex-1 text-sm outline-none placeholder-gray-400"
          />
          {total > 0 && (
            <span className="text-xs text-gray-400 whitespace-nowrap">
              {total.toLocaleString()} event{total !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="py-16 text-center text-sm text-gray-400">Loading events…</div>
        ) : error ? (
          <div className="py-16 text-center text-sm text-red-500">
            Failed to load events — make sure the ingestion service is running.
          </div>
        ) : events.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-3">
              <Zap className="w-6 h-6 text-indigo-500" />
            </div>
            <p className="text-sm font-medium text-gray-700 mb-1">No events yet</p>
            <p className="text-xs text-gray-400">
              {debouncedSearch
                ? 'No events match your search.'
                : 'Send your first event via POST /ingest/events to see it here.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-2 w-6" />
                  <th className="px-4 py-2">Event</th>
                  <th className="px-4 py-2">Source</th>
                  <th className="px-4 py-2">User</th>
                  <th className="px-4 py-2">Correlation ID</th>
                  <th className="px-4 py-2">Received</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {events.map((event) => (
                  <EventRow key={event.id} event={event} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
            <span className="text-xs text-gray-500">
              Page {currentPage} of {pages}
            </span>
            <div className="flex gap-2">
              <button
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - limit))}
                className="px-3 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                disabled={offset + limit >= total}
                onClick={() => setOffset(offset + limit)}
                className="px-3 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
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
