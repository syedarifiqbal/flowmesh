import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useFormik } from 'formik'
import { toFormikValidationSchema } from 'zod-formik-adapter'
import api from '../../lib/api'
import { useToastContext } from '../../components/ui/ToastProvider'
import { editSchema, type EditFormValues } from './destinationSchema'
import WebhookFields from './fields/WebhookFields'
import PostgresFields from './fields/PostgresFields'
import SlackFields from './fields/SlackFields'
import DiscordFields from './fields/DiscordFields'

interface Destination {
  id: string
  name: string
  type: string
  status: string
}

interface Props {
  destination: Destination | null
  onClose: () => void
}

const EMPTY_VALUES: EditFormValues = {
  name: '',
  webhookUrl: '',
  secret: '',
  pgUrl: '',
  table: '',
  slackUrl: '',
  slackChannel: '',
  discordUrl: '',
  discordUsername: '',
}

export default function EditDestinationModal({ destination, onClose }: Props) {
  const { toast } = useToastContext()
  const queryClient = useQueryClient()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const [showSecret, setShowSecret] = useState(false)
  const [showPgUrl, setShowPgUrl] = useState(false)

  const open = !!destination

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
    mutationFn: (values: EditFormValues) => {
      const body: Record<string, unknown> = { name: values.name }
      const type = destination?.type

      if (type === 'webhook') {
        const config: Record<string, string> = {}
        if (values.webhookUrl) config.url = values.webhookUrl
        if (values.secret) config.secret = values.secret
        if (Object.keys(config).length > 0) body.config = config
      } else if (type === 'postgres') {
        const config: Record<string, string> = {}
        if (values.pgUrl) config.url = values.pgUrl
        if (values.table?.trim()) config.table = values.table.trim()
        if (Object.keys(config).length > 0) body.config = config
      } else if (type === 'slack') {
        const config: Record<string, string> = {}
        if (values.slackUrl) config.url = values.slackUrl
        if (values.slackChannel?.trim()) config.channel = values.slackChannel.trim()
        if (Object.keys(config).length > 0) body.config = config
      } else if (type === 'discord') {
        const config: Record<string, string> = {}
        if (values.discordUrl) config.url = values.discordUrl
        if (values.discordUsername?.trim()) config.username = values.discordUsername.trim()
        if (Object.keys(config).length > 0) body.config = config
      }

      return api.put(`/destinations/${destination!.id}`, body).then((r) => r.data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['destinations'] })
      toast({ title: 'Destination updated', variant: 'success' })
      handleClose()
    },
    onError: () => {
      toast({ title: 'Failed to update destination', variant: 'error' })
    },
  })

  const formik = useFormik<EditFormValues>({
    initialValues: { ...EMPTY_VALUES, name: destination?.name ?? '' },
    enableReinitialize: true,
    validationSchema: toFormikValidationSchema(editSchema),
    onSubmit: async (values) => {
      try { await mutation.mutateAsync(values) } catch { /* handled in onError */ }
    },
  })

  if (!open || !destination) return null

  const type = destination.type
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
        aria-labelledby="edit-dest-title"
      >
        <h2 id="edit-dest-title" className="text-base font-semibold text-gray-900 mb-5">
          Edit Destination
        </h2>

        <form onSubmit={formik.handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="edit-dest-name" className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              id="edit-dest-name"
              type="text"
              {...formik.getFieldProps('name')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            {formik.touched.name && formik.errors.name && (
              <p className="mt-1 text-sm text-red-600">{formik.errors.name}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <div className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-500 bg-gray-50">
              {destination.type}
            </div>
            <p className="mt-1 text-xs text-gray-400">
              Type cannot be changed. Delete and recreate to use a different type.
            </p>
          </div>

          {type === 'webhook' && <WebhookFields formik={f} mode="edit" showSecret={showSecret} onToggleSecret={() => setShowSecret((s) => !s)} />}
          {type === 'postgres' && <PostgresFields formik={f} mode="edit" showPgUrl={showPgUrl} onTogglePgUrl={() => setShowPgUrl((s) => !s)} />}
          {type === 'slack' && <SlackFields formik={f} mode="edit" />}
          {type === 'discord' && <DiscordFields formik={f} mode="edit" />}

          <div className="flex justify-end gap-3 pt-2">
            <button ref={cancelRef} type="button" onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={formik.isSubmitting}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50">
              {formik.isSubmitting ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
