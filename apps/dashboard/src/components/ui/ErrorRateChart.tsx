import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { AlertTriangle } from 'lucide-react'
import api from '../../lib/api'

type Range = '1h' | '24h' | '7d'

interface ErrorRateBucket {
  time: string
  total: number
  failed: number
  rate: number
}

interface ErrorRateResponse {
  buckets: ErrorRateBucket[]
}

function formatXLabel(isoTime: string, range: Range): string {
  const d = new Date(isoTime)
  if (range === '7d') {
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit' })
  }
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatTooltipLabel(isoTime: string): string {
  return new Date(isoTime).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const RANGE_LABELS: Record<Range, string> = { '1h': '1h', '24h': '24h', '7d': '7d' }

export default function ErrorRateChart() {
  const [range, setRange] = useState<Range>('1h')

  const { data, isLoading } = useQuery<ErrorRateResponse>({
    queryKey: ['error-rate', range],
    queryFn: () =>
      api
        .get<ErrorRateResponse>(`/delivery/error-rate?range=${range}`)
        .then((r) => r.data),
    refetchInterval: 30_000,
  })

  const buckets = data?.buckets ?? []
  const totalFailed = buckets.reduce((sum, b) => sum + b.failed, 0)
  const peakRate = buckets.reduce((max, b) => Math.max(max, b.rate), 0)
  const tickCount = range === '7d' ? 7 : 6

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500" />
          <h2 className="text-sm font-semibold text-gray-900">Delivery error rate</h2>
          {!isLoading && totalFailed > 0 && (
            <span className="text-xs text-gray-400 font-normal">
              {totalFailed.toLocaleString()} failed · peak {peakRate.toFixed(1)}%
            </span>
          )}
          {!isLoading && totalFailed === 0 && buckets.length > 0 && (
            <span className="text-xs text-green-600 font-normal">all deliveries succeeded</span>
          )}
        </div>
        <div className="flex rounded-md border border-gray-200 overflow-hidden">
          {(Object.keys(RANGE_LABELS) as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1 text-xs font-medium transition-colors ${
                range === r
                  ? 'bg-red-500 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {RANGE_LABELS[r]}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="h-48 flex items-center justify-center">
          <div className="h-32 w-full bg-gray-50 rounded animate-pulse" />
        </div>
      ) : buckets.length === 0 ? (
        <div className="h-48 flex items-center justify-center text-sm text-gray-400">
          No delivery attempts in the last {RANGE_LABELS[range]}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={192}>
          <AreaChart data={buckets} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="errorRateGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
            <XAxis
              dataKey="time"
              tickFormatter={(v) => formatXLabel(v as string, range)}
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              tickCount={tickCount}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              tickLine={false}
              axisLine={false}
              allowDecimals={true}
              tickFormatter={(v) => `${(v as number).toFixed(0)}%`}
              domain={[0, 'auto']}
              width={40}
            />
            <Tooltip
              labelFormatter={(v) => formatTooltipLabel(v as string)}
              formatter={(v, name) => {
                if (name === 'rate') return [`${(v as number).toFixed(1)}%`, 'error rate']
                return [v, name]
              }}
              contentStyle={{
                fontSize: 12,
                borderRadius: 6,
                border: '1px solid #e5e7eb',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
              }}
            />
            <Area
              type="monotone"
              dataKey="rate"
              stroke="#ef4444"
              strokeWidth={2}
              fill="url(#errorRateGradient)"
              dot={false}
              activeDot={{ r: 3, fill: '#ef4444' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
