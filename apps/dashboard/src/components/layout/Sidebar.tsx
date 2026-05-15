import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Zap, GitBranch, Share2, Key, Settings, LogOut, Inbox, Bell } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { clearTokens } from '../../lib/auth'
import api from '../../lib/api'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/events', label: 'Events', icon: Zap },
  { to: '/pipelines', label: 'Pipelines', icon: GitBranch },
  { to: '/destinations', label: 'Destinations', icon: Share2 },
  { to: '/api-keys', label: 'API Keys', icon: Key },
  { to: '/alerts', label: 'Alerts', icon: Bell },
  { to: '/settings', label: 'Settings', icon: Settings },
]

function NavItem({ to, label, icon: Icon, badge }: { to: string; label: string; icon: React.ElementType; badge?: number }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
          isActive
            ? 'bg-indigo-600 text-white'
            : 'text-gray-400 hover:bg-gray-800 hover:text-white'
        }`
      }
    >
      <Icon size={18} />
      <span className="flex-1">{label}</span>
      {badge != null && badge > 0 && (
        <span className="ml-auto flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-xs font-semibold leading-none">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </NavLink>
  )
}

export default function Sidebar() {
  const navigate = useNavigate()

  const { data: dlqData } = useQuery({
    queryKey: ['dlq-count'],
    queryFn: () => api.get<{ total: number }>('/dlq?limit=1').then(r => r.data),
    refetchInterval: 30_000,
    staleTime: 30_000,
  })

  function handleLogout() {
    clearTokens()
    navigate('/login')
  }

  return (
    <aside className="fixed inset-y-0 left-0 w-64 bg-gray-900 flex flex-col">
      <div className="px-6 py-5 border-b border-gray-800">
        <span className="text-white font-bold text-lg tracking-tight">FlowMesh</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ to, label, icon }) => (
          <NavItem key={to} to={to} label={label} icon={icon} />
        ))}
        <NavItem to="/dlq" label="Dead Letters" icon={Inbox} badge={dlqData?.total} />
      </nav>

      <div className="px-3 py-4 border-t border-gray-800">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-sm font-medium text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
        >
          <LogOut size={18} />
          Logout
        </button>
      </div>
    </aside>
  )
}
