import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useFormik } from 'formik'
import { toFormikValidationSchema } from 'zod-formik-adapter'
import api from '../../lib/api'
import { useToastContext } from '../../components/ui/ToastProvider'
import { createSchema, CREATE_INITIAL_VALUES, type CreateFormValues } from './destinationSchema'
import WebhookFields from './fields/WebhookFields'
import PostgresFields from './fields/PostgresFields'
import SlackFields from './fields/SlackFields'
import DiscordFields from './fields/DiscordFields'

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
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
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
    mutationFn: (values: CreateFormValues) => {
      let config: Record<string, string>
      if (values.type === 'webhook') {
        config = { url: values.webhookUrl! }
        if (values.secret) config.secret = values.secret
      } else if (values.type === 'slack') {
        config = { url: values.slackUrl! }
        if (values.slackChannel?.trim()) config.channel = values.slackChannel.trim()
      } else if (values.type === 'discord') {
        config = { url: values.discordUrl! }
        if (values.discordUsername?.trim()) config.username = values.discordUsername.trim()
      } else {
        config = { url: values.pgUrl! }
        if (values.table?.trim()) config.table = values.table.trim()
      }
      return api.post('/destinations', { name: values.name, type: values.type, config }).then((r) => r.data)
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

  const formik = useFormik<CreateFormValues>({
    initialValues: CREATE_INITIAL_VALUES,
    validationSchema: toFormikValidationSchema(createSchema),
    onSubmit: async (values) => {
      try { await mutation.mutateAsync(values) } catch { /* handled in onError */ }
    },
  })

  function handleTypeChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as CreateFormValues['type']
    formik.setValues({ ...CREATE_INITIAL_VALUES, name: formik.values.name, type: next })
    formik.setTouched({})
  }

  if (!open) return null

  const type = formik.values.type
  const f = {
    getFieldProps: (field: string) => formik.getFieldProps(field),
    touched: formik.touched as Record<string, boolean | undefined>,
    errors: formik.errors as Record<string, string | undefined>,
  }

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
          <div>
            <label htmlFor="dest-name" className="block text-sm font-medium text-gray-700 mb-1">Name</label>
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

          <div>
            <label htmlFor="dest-type" className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              id="dest-type"
              {...formik.getFieldProps('type')}
              onChange={handleTypeChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="webhook">Webhook</option>
              <option value="postgres">PostgreSQL</option>
              <option value="slack">Slack</option>
              <option value="discord">Discord</option>
            </select>
          </div>

          {type === 'webhook' && <WebhookFields formik={f} mode="create" showSecret={showSecret} onToggleSecret={() => setShowSecret((s) => !s)} />}
          {type === 'postgres' && <PostgresFields formik={f} mode="create" showPgUrl={showPgUrl} onTogglePgUrl={() => setShowPgUrl((s) => !s)} />}
          {type === 'slack' && <SlackFields formik={f} mode="create" />}
          {type === 'discord' && <DiscordFields formik={f} mode="create" />}

          <div className="flex justify-end gap-3 pt-2">
            <button ref={cancelRef} type="button" onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={formik.isSubmitting}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50">
              {formik.isSubmitting ? 'Adding...' : 'Add destination'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
