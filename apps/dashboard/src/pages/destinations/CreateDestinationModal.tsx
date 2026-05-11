import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useFormik } from 'formik'
import { toFormikValidationSchema } from 'zod-formik-adapter'
import { z } from 'zod'
import { Eye, EyeOff } from 'lucide-react'
import api from '../../lib/api'
import { useToastContext } from '../../components/ui/ToastProvider'

const schema = z
  .object({
    name: z.string().min(1, 'Name is required').max(100),
    type: z.enum(['webhook', 'postgres', 'slack']),
    // webhook fields
    webhookUrl: z.string().optional(),
    secret: z.string().optional(),
    // postgres fields
    pgUrl: z.string().optional(),
    table: z.string().optional(),
    // slack fields
    slackUrl: z.string().optional(),
    slackChannel: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'webhook') {
      if (!data.webhookUrl || !z.string().url().safeParse(data.webhookUrl).success) {
        ctx.addIssue({ code: 'custom', path: ['webhookUrl'], message: 'Enter a valid URL' })
      }
    }
    if (data.type === 'postgres') {
      if (!data.pgUrl || data.pgUrl.trim() === '') {
        ctx.addIssue({ code: 'custom', path: ['pgUrl'], message: 'Connection URL is required' })
      }
    }
    if (data.type === 'slack') {
      if (!data.slackUrl || !z.string().url().safeParse(data.slackUrl).success) {
        ctx.addIssue({ code: 'custom', path: ['slackUrl'], message: 'Enter a valid Slack webhook URL' })
      }
    }
  })

type FormValues = z.infer<typeof schema>

const INITIAL_VALUES: FormValues = {
  name: '',
  type: 'webhook',
  webhookUrl: '',
  secret: '',
  pgUrl: '',
  table: '',
  slackUrl: '',
  slackChannel: '',
}

interface Props {
  open: boolean
  onClose: () => void
}

export default function CreateDestinationModal({ open, onClose }: Props) {
  const { toast } = useToastContext()
  const queryClient = useQueryClient()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const [showSecret, setShowSecret] = useState(false)
  const [showPgUrl, setShowPgUrl] = useState(false)

  useEffect(() => {
    if (!open) return
    cancelRef.current?.focus()
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open])

  function handleClose() {
    setShowSecret(false)
    setShowPgUrl(false)
    formik.resetForm()
    onClose()
  }

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      let config: Record<string, string>
      if (values.type === 'webhook') {
        config = { url: values.webhookUrl! }
        if (values.secret) config.secret = values.secret
      } else if (values.type === 'slack') {
        config = { url: values.slackUrl! }
        if (values.slackChannel?.trim()) config.channel = values.slackChannel.trim()
      } else {
        config = { url: values.pgUrl! }
        if (values.table?.trim()) config.table = values.table.trim()
      }

      return api
        .post('/destinations', { name: values.name, type: values.type, config })
        .then((r) => r.data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['destinations'] })
      toast({ title: 'Destination created', variant: 'success' })
      handleClose()
    },
    onError: () => {
      toast({ title: 'Failed to create destination', variant: 'error' })
    },
  })

  const formik = useFormik<FormValues>({
    initialValues: INITIAL_VALUES,
    validationSchema: toFormikValidationSchema(schema),
    onSubmit: async (values) => {
      try {
        await mutation.mutateAsync(values)
      } catch {
        // handled in mutation.onError
      }
    },
  })

  function handleTypeChange(e: React.ChangeEvent<HTMLSelectElement>) {
    // clear the other type's fields when switching so stale values don't leak into config
    const next = e.target.value as FormValues['type']
    formik.setValues({
      ...INITIAL_VALUES,
      name: formik.values.name,
      type: next,
    })
    formik.setTouched({})
  }

  if (!open) return null

  const isWebhook = formik.values.type === 'webhook'
  const isPostgres = formik.values.type === 'postgres'
  const isSlack = formik.values.type === 'slack'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={handleClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-dest-title"
      >
        <h2 id="create-dest-title" className="text-base font-semibold text-gray-900 mb-5">
          Add Destination
        </h2>

        <form onSubmit={formik.handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label htmlFor="dest-name" className="block text-sm font-medium text-gray-700 mb-1">
              Name
            </label>
            <input
              id="dest-name"
              type="text"
              {...formik.getFieldProps('name')}
              placeholder="e.g. Production Postgres"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            {formik.touched.name && formik.errors.name && (
              <p className="mt-1 text-sm text-red-600">{formik.errors.name}</p>
            )}
          </div>

          {/* Type */}
          <div>
            <label htmlFor="dest-type" className="block text-sm font-medium text-gray-700 mb-1">
              Type
            </label>
            <select
              id="dest-type"
              {...formik.getFieldProps('type')}
              onChange={handleTypeChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="webhook">Webhook</option>
              <option value="postgres">PostgreSQL</option>
              <option value="slack">Slack</option>
            </select>
          </div>

          {/* ── Webhook fields ─────────────────────────────────────────── */}
          {isWebhook && (
            <>
              <div>
                <label htmlFor="dest-webhook-url" className="block text-sm font-medium text-gray-700 mb-1">
                  Webhook URL
                </label>
                <input
                  id="dest-webhook-url"
                  type="url"
                  {...formik.getFieldProps('webhookUrl')}
                  placeholder="https://your-server.com/webhook"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                {formik.touched.webhookUrl && formik.errors.webhookUrl && (
                  <p className="mt-1 text-sm text-red-600">{formik.errors.webhookUrl}</p>
                )}
              </div>

              <div>
                <label htmlFor="dest-secret" className="block text-sm font-medium text-gray-700 mb-1">
                  Signing secret{' '}
                  <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <div className="relative">
                  <input
                    id="dest-secret"
                    type={showSecret ? 'text' : 'password'}
                    {...formik.getFieldProps('secret')}
                    placeholder="Used to sign requests with HMAC-SHA256"
                    className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret((s) => !s)}
                    aria-label={showSecret ? 'Hide secret' : 'Show secret'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ── PostgreSQL fields ──────────────────────────────────────── */}
          {isPostgres && (
            <>
              <div>
                <label htmlFor="dest-pg-url" className="block text-sm font-medium text-gray-700 mb-1">
                  Connection URL
                </label>
                <div className="relative">
                  <input
                    id="dest-pg-url"
                    type={showPgUrl ? 'text' : 'password'}
                    {...formik.getFieldProps('pgUrl')}
                    placeholder="postgresql://user:password@host:5432/dbname"
                    className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPgUrl((s) => !s)}
                    aria-label={showPgUrl ? 'Hide connection URL' : 'Show connection URL'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPgUrl ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {formik.touched.pgUrl && formik.errors.pgUrl && (
                  <p className="mt-1 text-sm text-red-600">{formik.errors.pgUrl}</p>
                )}
                <p className="mt-1 text-xs text-gray-500">
                  Credentials are encrypted at rest and never returned after saving.
                </p>
              </div>

              <div>
                <label htmlFor="dest-table" className="block text-sm font-medium text-gray-700 mb-1">
                  Table name{' '}
                  <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  id="dest-table"
                  type="text"
                  {...formik.getFieldProps('table')}
                  placeholder="flowmesh_events"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Defaults to <code className="bg-gray-100 px-1 rounded">flowmesh_events</code>. Use{' '}
                  <code className="bg-gray-100 px-1 rounded">schema.table</code> for schema-qualified names.
                </p>
              </div>
            </>
          )}

          {/* ── Slack fields ──────────────────────────────────────────── */}
          {isSlack && (
            <>
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                Create an incoming webhook in your Slack workspace at{' '}
                <a
                  href="https://api.slack.com/apps"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-medium"
                >
                  api.slack.com/apps
                </a>
                , then paste the webhook URL below.
              </div>

              <div>
                <label htmlFor="dest-slack-url" className="block text-sm font-medium text-gray-700 mb-1">
                  Slack Webhook URL
                </label>
                <input
                  id="dest-slack-url"
                  type="url"
                  {...formik.getFieldProps('slackUrl')}
                  placeholder="https://hooks.slack.com/services/T.../B.../..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                {formik.touched.slackUrl && formik.errors.slackUrl && (
                  <p className="mt-1 text-sm text-red-600">{formik.errors.slackUrl}</p>
                )}
                <p className="mt-1 text-xs text-gray-500">
                  The URL is encrypted at rest and never returned after saving.
                </p>
              </div>

              <div>
                <label htmlFor="dest-slack-channel" className="block text-sm font-medium text-gray-700 mb-1">
                  Channel{' '}
                  <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  id="dest-slack-channel"
                  type="text"
                  {...formik.getFieldProps('slackChannel')}
                  placeholder="#alerts"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Overrides the default channel set on the webhook. Leave blank to use the webhook default.
                </p>
              </div>
            </>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              ref={cancelRef}
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={formik.isSubmitting}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50"
            >
              {formik.isSubmitting ? 'Adding...' : 'Add destination'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
