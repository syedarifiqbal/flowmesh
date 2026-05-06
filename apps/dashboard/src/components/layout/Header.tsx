import { useLocation } from 'react-router-dom'

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/events': 'Events Explorer',
  '/pipelines': 'Pipelines',
  '/api-keys': 'API Keys',
  '/settings': 'Settings',
}

export default function Header() {
  const { pathname } = useLocation()
  const title = pageTitles[pathname] ?? 'FlowMesh'
  const workspaceName = localStorage.getItem('workspace_name')

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
      {workspaceName && (
        <span className="text-sm text-gray-500">{workspaceName}</span>
      )}
    </header>
  )
}
