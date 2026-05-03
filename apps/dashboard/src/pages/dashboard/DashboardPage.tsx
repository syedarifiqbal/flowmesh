import { Zap, GitBranch, Share2, AlertTriangle } from 'lucide-react'

const stats = [
  { label: 'Total Events', value: '—', icon: Zap },
  { label: 'Active Pipelines', value: '—', icon: GitBranch },
  { label: 'Destinations', value: '—', icon: Share2 },
  { label: 'Failed Deliveries', value: '—', icon: AlertTriangle },
]

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-white border border-gray-200 rounded-lg shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-500">{label}</span>
              <Icon size={18} className="text-gray-400" />
            </div>
            <span className="text-2xl font-bold text-gray-900">{value}</span>
          </div>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Live Event Feed</h2>
        <p className="text-sm text-gray-500">
          Connect the analytics service to enable real-time events.
        </p>
      </div>
    </div>
  )
}
