import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Key, Copy } from 'lucide-react'
import api from '../../lib/api'
import { useToastContext } from '../../components/ui/ToastProvider'
import ConfirmModal from '../../components/ui/ConfirmModal'
import CreateApiKeyModal from './CreateApiKeyModal'

interface ApiKey {
  id: string
  name: string
  keyPrefix: string
  createdAt: string
  revokedAt: string | null
}

export default function ApiKeysPage() {
  const { toast } = useToastContext()
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState<ApiKey | null>(null)

  const { data, isLoading, error } = useQuery<ApiKey[]>({
    queryKey: ['api-keys'],
    queryFn: () =>
      api.get('/api-keys').then((r) =>
        (r.data as ApiKey[]).filter((k) => !k.revokedAt),
      ),
  })

  const revokeMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api-keys/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] })
      toast({ title: 'API key revoked', variant: 'success' })
      setRevokeTarget(null)
    },
    onError: () => {
      toast({ title: 'Failed to revoke API key', variant: 'error' })
      setRevokeTarget(null)
    },
  })

  function copyPrefix(keyPrefix: string) {
    navigator.clipboard.writeText(keyPrefix)
    toast({ title: 'Prefix copied', variant: 'info' })
  }

  return (
    <>
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">API Keys</h1>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Key className="w-4 h-4" />
            Create API Key
          </button>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          {isLoading && (
            <div className="p-8 text-center text-sm text-gray-500">Loading...</div>
          )}

          {error && (
            <div className="p-8 text-center text-sm text-red-500">
              Failed to load API keys — please try again.
            </div>
          )}

          {data && data.length === 0 && (
            <div className="p-8 text-center text-sm text-gray-500">
              No API keys yet. Create one to start ingesting events.
            </div>
          )}

          {data && data.length > 0 && (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Key Prefix
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.map((key) => (
                  <tr key={key.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-900">{key.name}</td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => copyPrefix(key.keyPrefix)}
                        aria-label={`Copy prefix for ${key.name}`}
                        className="inline-flex items-center gap-1.5 font-mono text-xs bg-gray-100 px-2 py-1 rounded hover:bg-gray-200 transition-colors"
                      >
                        {key.keyPrefix}••••••••
                        <Copy className="w-3 h-3 text-gray-400" />
                      </button>
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      {new Date(key.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => setRevokeTarget(key)}
                        className="text-red-500 hover:text-red-700 text-xs font-medium"
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <CreateApiKeyModal open={showCreate} onClose={() => setShowCreate(false)} />

      <ConfirmModal
        open={!!revokeTarget}
        title="Revoke API Key"
        description={`Revoke "${revokeTarget?.name}"? Any application using this key will stop working immediately.`}
        confirmLabel="Revoke"
        variant="danger"
        isPending={revokeMutation.isPending}
        onConfirm={() => revokeTarget && revokeMutation.mutate(revokeTarget.id)}
        onCancel={() => setRevokeTarget(null)}
      />
    </>
  )
}
