import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import OfflineBanner from './OfflineBanner'
import PageErrorBoundary from '../ui/PageErrorBoundary'

export default function AppLayout() {
  const location = useLocation()

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col ml-64">
        <Header />
        <OfflineBanner />
        <main className="flex-1 overflow-auto p-6">
          <PageErrorBoundary locationKey={location.key}>
            <Outlet />
          </PageErrorBoundary>
        </main>
      </div>
    </div>
  )
}
