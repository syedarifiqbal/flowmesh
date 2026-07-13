import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, ChevronDown, ChevronRight, Zap, Wifi, WifiOff, User, X, Filter, UserCircle } from 'lucide-react'
import api from '../../lib/api'
import { useEventStream, type LiveEvent } from '../../hooks/useEventStream'
import { UserProfileDrawer } from './UserProfileDrawer'

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

function EventRow({
  event,
  isLive,
  onUserClick,
  onUserProfile,
  activeUserFilterType,
}: {
  event: Event | LiveEvent
  isLive?: boolean
  onUserClick: (id: string, type: 'userId' | 'anonymousId') => void
  onUserProfile: (userId: string) => void
  activeUserFilterType?: 'userId' | 'anonymousId'
}) {
  const [expanded, setExpanded] = useState(false)
  const hasProperties = event.properties && Object.keys(event.properties).length > 0

  // When filtering by anonymousId and the event has both IDs, prefer showing the anonymousId
  // so the User column stays consistent with what the filter matched on.
  const preferAnon = activeUserFilterType === 'anonymousId' && !!event.anonymousId
  const userDisplay = preferAnon ? event.anonymousId : (event.userId ?? event.anonymousId)
  const userType: 'userId' | 'anonymousId' = preferAnon ? 'anonymousId' : (event.userId ? 'userId' : 'anonymousId')

  return (
    <>
      <tr
        className={`hover:bg-gray-50 cursor-pointer select-none${isLive ? ' bg-emerald-50/40' : ''}`}
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
        <td className="px-4 py-3">
          {userDisplay ? (
            <div className="flex items-center gap-1 group/user">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onUserClick(userDisplay, userType)
                }}
                title={`Filter by ${userType === 'userId' ? 'user' : 'anonymous'} ID`}
                className="text-xs font-mono text-indigo-600 hover:underline hover:text-indigo-800 transition-colors max-w-[140px] truncate block text-left"
              >
                {userDisplay}
              </button>
              {userType === 'userId' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onUserProfile(userDisplay)
                  }}
                  title="View user profile"
                  className="opacity-0 group-hover/user:opacity-100 text-gray-400 hover:text-indigo-600 transition-all shrink-0"
                >
                  <UserCircle className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ) : (
            <span className="text-gray-400 text-sm">—</span>
          )}
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
  const [userFilter, setUserFilter] = useState('')
  const [userFilterType, setUserFilterType] = useState<'userId' | 'anonymousId'>('userId')
  const [debouncedUser, setDebouncedUser] = useState('')
  const [debouncedUserType, setDebouncedUserType] = useState<'userId' | 'anonymousId'>('userId')
  const [eventFilter, setEventFilter] = useState('')
  const [debouncedEvent, setDebouncedEvent] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [debouncedSource, setDebouncedSource] = useState('')
  const [offset, setOffset] = useState(0)
  const [profileUserId, setProfileUserId] = useState<string | null>(null)
  const limit = 50

  const { liveEvents, status } = useEventStream()

  function handleSearch(value: string) {
    setSearch(value)
    clearTimeout((handleSearch as unknown as { timer?: ReturnType<typeof setTimeout> }).timer)
    ;(handleSearch as unknown as { timer?: ReturnType<typeof setTimeout> }).timer = setTimeout(() => {
      setDebouncedSearch(value)
      setOffset(0)
    }, 400)
  }

  function handleUserInput(value: string) {
    setUserFilter(value)
    const type = value.startsWith('anon_') ? 'anonymousId' : 'userId'
    setUserFilterType(type)
    clearTimeout((handleUserInput as unknown as { timer?: ReturnType<typeof setTimeout> }).timer)
    ;(handleUserInput as unknown as { timer?: ReturnType<typeof setTimeout> }).timer = setTimeout(() => {
      setDebouncedUser(value)
      setDebouncedUserType(type)
      setOffset(0)
    }, 400)
  }

  function applyUserClick(id: string, type: 'userId' | 'anonymousId') {
    setUserFilter(id)
    setUserFilterType(type)
    setDebouncedUser(id)
    setDebouncedUserType(type)
    setOffset(0)
  }

  function clearUserFilter() {
    setUserFilter('')
    setUserFilterType('userId')
    setDebouncedUser('')
    setDebouncedUserType('userId')
    setOffset(0)
  }

  function handleEventFilter(value: string) {
    setEventFilter(value)
    clearTimeout((handleEventFilter as unknown as { timer?: ReturnType<typeof setTimeout> }).timer)
    ;(handleEventFilter as unknown as { timer?: ReturnType<typeof setTimeout> }).timer = setTimeout(() => {
      setDebouncedEvent(value)
      setOffset(0)
    }, 400)
  }

  function handleSourceFilter(value: string) {
    setSourceFilter(value)
    clearTimeout((handleSourceFilter as unknown as { timer?: ReturnType<typeof setTimeout> }).timer)
    ;(handleSourceFilter as unknown as { timer?: ReturnType<typeof setTimeout> }).timer = setTimeout(() => {
      setDebouncedSource(value)
      setOffset(0)
    }, 400)
  }

  function clearAllFilters() {
    setSearch(''); setDebouncedSearch('')
    setUserFilter(''); setUserFilterType('userId'); setDebouncedUser(''); setDebouncedUserType('userId')
    setEventFilter(''); setDebouncedEvent('')
    setSourceFilter(''); setDebouncedSource('')
    setOffset(0)
  }

  const { data, isLoading, error } = useQuery<EventsResponse>({
    queryKey: ['events', debouncedSearch, debouncedUser, debouncedUserType, debouncedEvent, debouncedSource, offset],
    queryFn: () => {
      const params = new URLSearchParams()
      params.set('limit', String(limit))
      params.set('offset', String(offset))
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (debouncedUser) params.set(debouncedUserType, debouncedUser)
      if (debouncedEvent) params.set('event', debouncedEvent)
      if (debouncedSource) params.set('source', debouncedSource)
      return api.get<EventsResponse>(`/events?${params}`).then((r) => r.data)
    },
  })

  const storedEvents = data?.events ?? []
  const total = data?.total ?? 0
  const pages = Math.ceil(total / limit)
  const currentPage = Math.floor(offset / limit) + 1

  const hasFilter = !!(debouncedSearch || debouncedUser || debouncedEvent || debouncedSource)
  const activeFilterCount = [debouncedSearch, debouncedUser, debouncedEvent, debouncedSource].filter(Boolean).length
  const isLivePage = !hasFilter && offset === 0
  const storedIds = new Set(storedEvents.map((e) => e.eventId))
  const newLiveEvents = isLivePage ? liveEvents.filter((e) => !storedIds.has(e.eventId)) : []
  const displayEvents: (Event | LiveEvent)[] = [...newLiveEvents, ...storedEvents]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Events</h1>
        <div className="flex items-center gap-2">
          {status === 'connected' ? (
            <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              Live
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-gray-400">
              {status === 'connecting' ? (
                <Wifi className="w-3.5 h-3.5 animate-pulse" />
              ) : (
                <WifiOff className="w-3.5 h-3.5" />
              )}
              {status === 'connecting' ? 'Connecting…' : 'Offline'}
            </span>
          )}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        {/* Search bar */}
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input
            type="text"
            placeholder="Search by event name, source, or correlation ID…"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="flex-1 text-sm outline-none placeholder-gray-400"
          />
          {(total > 0 || newLiveEvents.length > 0) && (
            <span className="text-xs text-gray-400 whitespace-nowrap">
              {(total + newLiveEvents.length).toLocaleString()} event{total + newLiveEvents.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Filter bar */}
        <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50/60 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-2 min-w-[200px] flex-1">
            <User className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <input
              type="text"
              placeholder="User ID or anonymous ID…"
              value={userFilter}
              onChange={(e) => handleUserInput(e.target.value)}
              className="flex-1 text-xs outline-none placeholder-gray-400 bg-transparent min-w-0"
            />
            {userFilter && (
              <button onClick={clearUserFilter} aria-label="Clear user filter" className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-3 h-3" />
              </button>
            )}
            {debouncedUser && (
              <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
                {debouncedUserType === 'anonymousId' ? 'anon' : 'user'}
              </span>
            )}
          </div>

          <div className="w-px h-4 bg-gray-200 hidden sm:block" />

          <div className="flex items-center gap-2 min-w-[160px] flex-1">
            <Filter className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <input
              type="text"
              placeholder="Event name…"
              value={eventFilter}
              onChange={(e) => handleEventFilter(e.target.value)}
              className="flex-1 text-xs outline-none placeholder-gray-400 bg-transparent min-w-0 font-mono"
            />
            {eventFilter && (
              <button onClick={() => { setEventFilter(''); setDebouncedEvent(''); setOffset(0) }} aria-label="Clear event filter" className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="w-px h-4 bg-gray-200 hidden sm:block" />

          <div className="flex items-center gap-2 min-w-[120px] flex-1">
            <input
              type="text"
              placeholder="Source…"
              value={sourceFilter}
              onChange={(e) => handleSourceFilter(e.target.value)}
              className="flex-1 text-xs outline-none placeholder-gray-400 bg-transparent min-w-0"
            />
            {sourceFilter && (
              <button onClick={() => { setSourceFilter(''); setDebouncedSource(''); setOffset(0) }} aria-label="Clear source filter" className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {activeFilterCount > 1 && (
            <>
              <div className="w-px h-4 bg-gray-200 hidden sm:block" />
              <button
                onClick={clearAllFilters}
                className="text-xs text-gray-400 hover:text-gray-600 whitespace-nowrap transition-colors"
              >
                Clear all
              </button>
            </>
          )}
        </div>

        {isLoading ? (
          <div className="py-16 text-center text-sm text-gray-400">Loading events…</div>
        ) : error ? (
          <div className="py-16 text-center text-sm text-red-500">
            Failed to load events — make sure the ingestion service is running.
          </div>
        ) : displayEvents.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-3">
              <Zap className="w-6 h-6 text-indigo-500" />
            </div>
            <p className="text-sm font-medium text-gray-700 mb-1">No events yet</p>
            <p className="text-xs text-gray-400">
              {hasFilter
                ? 'No events match your filters.'
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
                {displayEvents.map((event) => (
                  <EventRow
                    key={event.eventId}
                    event={event}
                    isLive={newLiveEvents.some((e) => e.eventId === event.eventId)}
                    onUserClick={applyUserClick}
                    onUserProfile={setProfileUserId}
                    activeUserFilterType={debouncedUser ? debouncedUserType : undefined}
                  />
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

      {profileUserId && (
        <UserProfileDrawer
          userId={profileUserId}
          onClose={() => setProfileUserId(null)}
          onFilterEvents={(id, type) => {
            applyUserClick(id, type)
            setProfileUserId(null)
          }}
        />
      )}
    </div>
  )
}
