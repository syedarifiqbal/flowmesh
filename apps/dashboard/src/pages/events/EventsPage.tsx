import { useState } from 'react'
import { Zap, ChevronDown, ChevronUp, Copy, CheckCircle } from 'lucide-react'

const curlSnippet = `curl -X POST http://localhost:3000/ingest/events \\
  -H "x-api-key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "eventId": "evt-1",
    "correlationId": "corr-1",
    "event": "user.signup",
    "timestamp": "2026-05-03T10:00:00Z",
    "properties": {
      "userId": "123",
      "plan": "free"
    }
  }'`

export default function EventsPage() {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  async function copySnippet() {
    await navigator.clipboard.writeText(curlSnippet)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Events</h1>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-12 text-center mb-6">
        <div className="w-14 h-14 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <Zap className="w-7 h-7 text-indigo-600" />
        </div>
        <h2 className="text-base font-semibold text-gray-900 mb-2">Events Explorer</h2>
        <p className="text-sm text-gray-500 max-w-sm mx-auto">
          Send events via the ingestion API to see them processed by your pipelines. Real-time
          event history will appear here once the analytics service is running.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <button
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50 transition-colors"
          aria-expanded={open}
        >
          <span className="text-sm font-semibold text-gray-900">How to send an event</span>
          {open ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </button>

        {open && (
          <div className="px-6 pb-6 border-t border-gray-100">
            <p className="text-sm text-gray-600 mt-4 mb-3">
              Use your API key from the <strong>API Keys</strong> page. Replace{' '}
              <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">
                YOUR_API_KEY
              </code>{' '}
              with the key you created.
            </p>

            <div className="relative">
              <pre className="bg-gray-900 text-gray-100 text-xs font-mono rounded-lg p-4 overflow-x-auto leading-relaxed">
                {curlSnippet}
              </pre>
              <button
                onClick={copySnippet}
                aria-label="Copy curl snippet"
                className="absolute top-3 right-3 p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
              >
                {copied ? (
                  <CheckCircle className="w-4 h-4 text-green-400" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>

            <div className="mt-4 space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Required fields
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-600">
                {[
                  ['eventId', 'Unique ID — used for idempotency'],
                  ['correlationId', 'Trace ID across the pipeline'],
                  ['event', 'Event name — must match a pipeline trigger'],
                  ['timestamp', 'ISO 8601 timestamp'],
                ].map(([field, desc]) => (
                  <div key={field} className="flex items-start gap-2">
                    <code className="shrink-0 bg-gray-100 px-1.5 py-0.5 rounded font-mono text-gray-800">
                      {field}
                    </code>
                    <span className="text-gray-500">{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
