import { useQuery } from '@tanstack/react-query'
import { X, User, Link2, Users, Calendar, Activity, ChevronRight } from 'lucide-react'
import api from '../../lib/api'

interface UserProfile {
  userId: string
  traits: Record<string, unknown>
  anonymousIds: { anonymousId: string; linkedAt: string }[]
  groups: { groupId: string; traits: Record<string, unknown>; joinedAt: string }[]
  eventCount: number
  firstSeen: string | null
  lastSeen: string | null
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function Avatar({ userId }: { userId: string }) {
  const initials = userId.replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase() || userId.slice(0, 2).toUpperCase()
  return (
    <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
      <span className="text-indigo-700 font-bold text-sm">{initials}</span>
    </div>
  )
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-gray-400">{icon}</span>
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</span>
      </div>
      {children}
    </div>
  )
}

export function UserProfileDrawer({
  userId,
  onClose,
  onFilterEvents,
}: {
  userId: string
  onClose: () => void
  onFilterEvents: (id: string, type: 'userId' | 'anonymousId') => void
}) {
  const { data, isLoading, error } = useQuery<UserProfile>({
    queryKey: ['user-profile', userId],
    queryFn: () => api.get<UserProfile>(`/events/users/${encodeURIComponent(userId)}`).then((r) => r.data),
    enabled: !!userId,
  })

  const traitEntries = data ? Object.entries(data.traits) : []

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-96 bg-white border-l border-gray-200 shadow-xl z-50 flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-start gap-3">
          <Avatar userId={userId} />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-400 mb-0.5">User ID</p>
            <p className="text-sm font-mono text-gray-900 break-all leading-snug">{userId}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors shrink-0 mt-0.5"
            aria-label="Close profile"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {isLoading && (
            <div className="py-12 text-center text-sm text-gray-400">Loading profile…</div>
          )}
          {error && (
            <div className="py-12 text-center text-sm text-red-500">Failed to load profile.</div>
          )}
          {data && (
            <>
              {/* Event stats */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-indigo-50 rounded-lg px-3 py-2.5 text-center">
                  <p className="text-lg font-bold text-indigo-700">{data.eventCount.toLocaleString()}</p>
                  <p className="text-xs text-indigo-500 mt-0.5">Events</p>
                </div>
                <div className="bg-gray-50 rounded-lg px-3 py-2.5 text-center col-span-2">
                  <p className="text-xs text-gray-500 mb-1">First seen</p>
                  <p className="text-xs font-medium text-gray-700">{formatDate(data.firstSeen)}</p>
                </div>
              </div>

              {/* Traits */}
              <Section icon={<User className="w-3.5 h-3.5" />} title="Traits">
                {traitEntries.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">No traits recorded</p>
                ) : (
                  <div className="rounded-lg border border-gray-100 overflow-hidden">
                    {traitEntries.map(([key, value], i) => (
                      <div
                        key={key}
                        className={`flex items-start justify-between gap-3 px-3 py-2 text-xs ${i > 0 ? 'border-t border-gray-50' : ''}`}
                      >
                        <span className="text-gray-500 shrink-0">{key}</span>
                        <span className="font-medium text-gray-900 text-right break-all">
                          {String(value)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {/* Last seen */}
              <Section icon={<Calendar className="w-3.5 h-3.5" />} title="Activity">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">First seen</span>
                    <span className="text-gray-700">{formatDate(data.firstSeen)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Last seen</span>
                    <span className="text-gray-700">{formatDate(data.lastSeen)}</span>
                  </div>
                </div>
              </Section>

              {/* Anonymous IDs */}
              <Section icon={<Link2 className="w-3.5 h-3.5" />} title={`Anonymous IDs (${data.anonymousIds.length})`}>
                {data.anonymousIds.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">No anonymous IDs linked</p>
                ) : (
                  <div className="space-y-1.5">
                    {data.anonymousIds.map(({ anonymousId, linkedAt }) => (
                      <div key={anonymousId} className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2">
                        <div className="min-w-0">
                          <button
                            onClick={() => onFilterEvents(anonymousId, 'anonymousId')}
                            className="text-xs font-mono text-indigo-600 hover:underline truncate block text-left"
                            title="Filter events by this anonymous ID"
                          >
                            {anonymousId}
                          </button>
                          <p className="text-xs text-gray-400 mt-0.5">linked {formatDate(linkedAt)}</p>
                        </div>
                        <ChevronRight className="w-3 h-3 text-gray-300 shrink-0" />
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {/* Groups */}
              <Section icon={<Users className="w-3.5 h-3.5" />} title={`Groups (${data.groups.length})`}>
                {data.groups.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">Not in any groups</p>
                ) : (
                  <div className="space-y-2">
                    {data.groups.map(({ groupId, traits, joinedAt }) => (
                      <div key={groupId} className="rounded-lg border border-gray-100 overflow-hidden">
                        <div className="px-3 py-2 bg-gray-50 flex items-center justify-between">
                          <span className="text-xs font-medium text-gray-800 font-mono">{groupId}</span>
                          <span className="text-xs text-gray-400">{new Date(joinedAt).toLocaleDateString()}</span>
                        </div>
                        {Object.keys(traits).length > 0 && (
                          <div className="divide-y divide-gray-50">
                            {Object.entries(traits).map(([k, v]) => (
                              <div key={k} className="flex items-center justify-between px-3 py-1.5 text-xs">
                                <span className="text-gray-500">{k}</span>
                                <span className="text-gray-800 font-medium">{String(v)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            </>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-5 py-3 border-t border-gray-100 flex gap-2">
          <button
            onClick={() => { onFilterEvents(userId, 'userId'); onClose() }}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Activity className="w-3.5 h-3.5" />
            Show all events
          </button>
        </div>
      </div>
    </>
  )
}
