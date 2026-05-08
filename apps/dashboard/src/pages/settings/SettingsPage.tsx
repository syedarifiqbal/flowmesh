import { useQuery, useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import api from '../../lib/api'
import { clearTokens } from '../../lib/auth'
import { useToastContext } from '../../components/ui/ToastProvider'

interface UserProfile {
  id: string
  email: string
  workspaceId: string
  createdAt: string
}

export default function SettingsPage() {
  const { toast } = useToastContext()
  const navigate = useNavigate()
  const workspaceName = localStorage.getItem('workspace_name') ?? 'My Workspace'

  const { data: user, isLoading } = useQuery<UserProfile>({
    queryKey: ['me'],
    queryFn: () => api.get('/auth/me').then((r) => r.data),
  })

  const logoutMutation = useMutation({
    mutationFn: () => {
      const refreshToken = localStorage.getItem('refresh_token')
      return api.post('/auth/logout', { refreshToken })
    },
    onSettled: () => {
      clearTokens()
      navigate('/login', { replace: true })
    },
    onError: () => {
      toast({ title: 'Logout failed — clearing session anyway', variant: 'error' })
    },
  })

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Settings</h1>

      <div className="space-y-6 max-w-2xl">
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Account</h2>

          {isLoading && (
            <div className="space-y-3">
              <div className="h-4 bg-gray-100 rounded w-1/2 animate-pulse" />
              <div className="h-4 bg-gray-100 rounded w-1/3 animate-pulse" />
            </div>
          )}

          {user && (
            <dl className="space-y-3">
              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Email
                </dt>
                <dd className="text-sm text-gray-900">{user.email}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Workspace
                </dt>
                <dd className="text-sm text-gray-900">{workspaceName}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Member since
                </dt>
                <dd className="text-sm text-gray-900">
                  {new Date(user.createdAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </dd>
              </div>
            </dl>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-1">Sign out</h2>
          <p className="text-sm text-gray-500 mb-4">
            You will be signed out of this workspace on this device.
          </p>
          <button
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 bg-white border border-red-300 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            <LogOut className="w-4 h-4" />
            {logoutMutation.isPending ? 'Signing out...' : 'Sign out'}
          </button>
        </div>
      </div>
    </div>
  )
}
