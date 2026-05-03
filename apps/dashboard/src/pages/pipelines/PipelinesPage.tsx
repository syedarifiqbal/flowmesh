import { useQuery } from '@tanstack/react-query'
import api from '../../lib/api'
import type { Pipeline } from '@flowmesh/shared-types'

function fetchPipelines(): Promise<Pipeline[]> {
  return api.get('/pipelines').then((r) => r.data)
}

export default function PipelinesPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['pipelines'],
    queryFn: fetchPipelines,
  })

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
        <h2 className="text-base font-semibold text-gray-900">Pipelines</h2>
        <button className="px-3 py-1.5 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-md transition-colors">
          New pipeline
        </button>
      </div>

      {isLoading && (
        <div className="px-6 py-8 text-center text-sm text-gray-500">Loading...</div>
      )}

      {isError && (
        <div className="px-6 py-8 text-center text-sm text-red-500">
          Failed to load pipelines.
        </div>
      )}

      {data && data.length === 0 && (
        <div className="px-6 py-8 text-center text-sm text-gray-500">No pipelines yet.</div>
      )}

      {data && data.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
              <th className="px-6 py-3">Name</th>
              <th className="px-6 py-3">Trigger events</th>
              <th className="px-6 py-3">Status</th>
              <th className="px-6 py-3">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.map((pipeline) => (
              <tr key={pipeline.id} className="hover:bg-gray-50">
                <td className="px-6 py-3 font-medium text-gray-900">{pipeline.name}</td>
                <td className="px-6 py-3 text-gray-500">
                  {pipeline.trigger.events.join(', ')}
                </td>
                <td className="px-6 py-3">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      pipeline.enabled
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {pipeline.enabled ? 'Active' : 'Disabled'}
                  </span>
                </td>
                <td className="px-6 py-3 text-gray-500">
                  {new Date(pipeline.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
