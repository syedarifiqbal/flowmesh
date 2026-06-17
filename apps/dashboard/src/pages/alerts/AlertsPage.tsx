import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, Plus, ToggleLeft, ToggleRight, Trash2, Clock, CheckCircle, XCircle, FlaskConical } from 'lucide-react'
import api from '../../lib/api'
import { useToastContext } from '../../components/ui/ToastProvider'
import ConfirmModal from '../../components/ui/ConfirmModal'
import CreateAlertRuleModal from './CreateAlertRuleModal'

interface AlertRule {
  id: string
  name: string
  description: string | null
  enabled: boolean
  conditionType: string
  eventName: string | null
  propertyPath: string | null
  propertyValue: string | null
  thresholdCount: number | null
  windowSeconds: number | null
  channel: string
  webhookUrl: string | null
  slackWebhookUrl: string | null
  recipientEmail: string | null
  createdAt: string
}

interface HistoryEntry {
  id: string
  ruleId: string
  triggeredAt: string
  eventName: string | null
  notificationStatus: 'sent' | 'failed'
  notificationError: string | null
  rule: { name: string; channel: string }
}

interface HistoryResponse {
  items: HistoryEntry[]
  total: number
}

function conditionLabel(rule: AlertRule): string {
  if (rule.conditionType === 'any_event') {
    return rule.eventName ? `Any "${rule.eventName}" event` : 'Any event'
  }
  if (rule.conditionType === 'property_equals') {
    return `${rule.eventName ? `"${rule.eventName}" where ` : ''}${rule.propertyPath} = ${rule.propertyValue}`
  }
  if (rule.conditionType === 'count_threshold') {
    const prefix = rule.eventName ? `"${rule.eventName}" ` : ''
    return `${prefix}≥ ${rule.thresholdCount} events in ${rule.windowSeconds}s`
  }
  return rule.conditionType
}

function channelBadge(channel: string) {
  if (channel === 'slack') {
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700">Slack</span>
  }
  if (channel === 'email') {
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-50 text-purple-700">Email</span>
  }
  return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">Webhook</span>
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default function AlertsPage() {
  const { toast } = useToastContext()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'rules' | 'history'>('rules')
  const [showCreate, setShowCreate] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<AlertRule | null>(null)

  const { data: rules, isLoading, error } = useQuery<AlertRule[]>({
    queryKey: ['alert-rules'],
    queryFn: () => api.get('/alert-rules').then((r) => r.data as AlertRule[]),
  })

  const { data: history, isLoading: historyLoading } = useQuery<HistoryResponse>({
    queryKey: ['alert-history'],
    queryFn: () => api.get('/alert-rules/history?limit=50').then((r) => r.data as HistoryResponse),
    enabled: activeTab === 'history',
  })

  const toggleMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/alert-rules/${id}/toggle`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alert-rules'] })
    },
    onError: () => toast({ title: 'Failed to toggle rule', variant: 'error' }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/alert-rules/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alert-rules'] })
      toast({ title: 'Alert rule deleted', variant: 'success' })
      setDeleteTarget(null)
    },
    onError: () => {
      toast({ title: 'Failed to delete rule', variant: 'error' })
      setDeleteTarget(null)
    },
  })

  const testMutation = useMutation({
    mutationFn: (id: string) => api.post(`/alert-rules/${id}/test`),
    onSuccess: () => toast({ title: 'Test notification sent', variant: 'success' }),
    onError: () => toast({ title: 'Test notification failed', variant: 'error' }),
  })

  return (
    <>
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bell className="w-5 h-5 text-indigo-600" />
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Alerts</h1>
              <p className="text-sm text-gray-500">Get notified when events match your conditions</p>
            </div>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Rule
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex gap-4">
            {(['rules', 'history'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-3 text-sm font-medium border-b-2 transition-colors capitalize ${
                  activeTab === tab
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab === 'history' ? 'Alert History' : 'Rules'}
              </button>
            ))}
          </nav>
        </div>

        {/* Rules Tab */}
        {activeTab === 'rules' && (
          <div>
            {isLoading && (
              <div className="text-center py-12 text-sm text-gray-400">Loading rules…</div>
            )}
            {error && (
              <div className="text-center py-12 text-sm text-red-500">Failed to load alert rules.</div>
            )}
            {rules && rules.length === 0 && (
              <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-xl">
                <Bell className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-500">No alert rules yet</p>
                <p className="text-xs text-gray-400 mt-1">Create one to get notified when events match your conditions</p>
                <button
                  onClick={() => setShowCreate(true)}
                  className="mt-4 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  Create first rule
                </button>
              </div>
            )}
            {rules && rules.length > 0 && (
              <div className="space-y-3">
                {rules.map((rule) => (
                  <div
                    key={rule.id}
                    className={`bg-white border rounded-lg px-5 py-4 flex items-start gap-4 transition-opacity ${
                      rule.enabled ? 'border-gray-200 opacity-100' : 'border-gray-100 opacity-60'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-gray-900">{rule.name}</span>
                        {channelBadge(rule.channel)}
                        {!rule.enabled && (
                          <span className="text-xs text-gray-400 italic">disabled</span>
                        )}
                      </div>
                      {rule.description && (
                        <p className="text-xs text-gray-500 mb-1">{rule.description}</p>
                      )}
                      <p className="text-xs font-mono text-gray-600 bg-gray-50 inline-block px-2 py-0.5 rounded">
                        {conditionLabel(rule)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => testMutation.mutate(rule.id)}
                        disabled={testMutation.isPending}
                        className="text-gray-400 hover:text-indigo-600 transition-colors disabled:opacity-40"
                        title="Send test notification"
                        aria-label="Test notification"
                      >
                        <FlaskConical className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => toggleMutation.mutate(rule.id)}
                        className="text-gray-400 hover:text-indigo-600 transition-colors"
                        title={rule.enabled ? 'Disable rule' : 'Enable rule'}
                      >
                        {rule.enabled
                          ? <ToggleRight className="w-5 h-5 text-indigo-600" />
                          : <ToggleLeft className="w-5 h-5" />
                        }
                      </button>
                      <button
                        onClick={() => setDeleteTarget(rule)}
                        className="text-gray-400 hover:text-red-500 transition-colors"
                        aria-label="Delete rule"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div>
            {historyLoading && (
              <div className="text-center py-12 text-sm text-gray-400">Loading history…</div>
            )}
            {history && history.items.length === 0 && (
              <div className="text-center py-12 text-sm text-gray-400">No alerts fired yet.</div>
            )}
            {history && history.items.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                      <th className="text-left px-4 py-3">Rule</th>
                      <th className="text-left px-4 py-3">Event</th>
                      <th className="text-left px-4 py-3">Channel</th>
                      <th className="text-left px-4 py-3">Status</th>
                      <th className="text-left px-4 py-3">Fired at</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.items.map((entry) => (
                      <tr key={entry.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-900">{entry.rule.name}</td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-600">{entry.eventName ?? '—'}</td>
                        <td className="px-4 py-3">{channelBadge(entry.rule.channel)}</td>
                        <td className="px-4 py-3">
                          {entry.notificationStatus === 'sent' ? (
                            <span className="flex items-center gap-1 text-green-600 text-xs">
                              <CheckCircle className="w-3.5 h-3.5" /> Sent
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-red-500 text-xs" title={entry.notificationError ?? ''}>
                              <XCircle className="w-3.5 h-3.5" /> Failed
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDate(entry.triggeredAt)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-4 py-3 text-xs text-gray-400 border-t border-gray-100">
                  Showing {history.items.length} of {history.total} entries
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <CreateAlertRuleModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ['alert-rules'] })
            toast({ title: 'Alert rule created', variant: 'success' })
            setShowCreate(false)
          }}
        />
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <ConfirmModal
          open={!!deleteTarget}
          title="Delete Alert Rule"
          description={`Delete "${deleteTarget.name}"? This will also remove its history.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
  )
}
