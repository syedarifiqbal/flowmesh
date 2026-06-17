import { WifiOff } from 'lucide-react'
import { useNetworkStatus } from '../../hooks/useNetworkStatus'

export default function OfflineBanner() {
  const isOnline = useNetworkStatus()

  if (isOnline) return null

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-yellow-50 border-b border-yellow-200 text-yellow-800 text-sm font-medium">
      <WifiOff size={15} className="shrink-0" />
      <span>You're offline — data may be outdated. Reconnecting when your connection returns.</span>
    </div>
  )
}
