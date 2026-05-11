import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useFormik } from 'formik'
import { toFormikValidationSchema } from 'zod-formik-adapter'
import { z } from 'zod'
import { Eye, EyeOff } from 'lucide-react'
import api from '../../lib/api'
import { useToastContext } from '../../components/ui/ToastProvider'

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  // config fields are all optional — empty means keep existing
  webhookUrl: z.string().optional(),
  secret: z.string().optional(),
  pgUrl: z.string().optional(),
  table: z.string().optional(),
  slackUrl: z.string().optional(),
  slackChannel: z.string().optional(),
  discordUrl: z.string().optional(),
  discordUsername: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.webhookUrl && !z.string().url().safeParse(data.webhookUrl).success) {
    ctx.addIssue({ code: 'custom', path: ['webhookUrl'], message: 'Enter a valid URL' })
  }
  if (data.slackUrl && !z.string().url().safeParse(data.slackUrl).success) {
    ctx.addIssue({ code: 'custom', path: ['slackUrl'], message: 'Enter a valid Slack webhook URL' })
  }
  if (data.discordUrl && !z.string().url().safeParse(data.discordUrl).success) {
    ctx.addIssue({ code: 'custom', path: ['discordUrl'], message: 'Enter a valid Discord webhook URL' })
  }
})

type FormValues = z.infer<typeof schema>

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
      const body: Record<string, unknown> = { name: values.name }

      if (destination?.type === 'webhook') {
        const config: Record<string, string> = {}
        if (values.webhookUrl) config.url = values.webhookUrl
        if (values.secret) config.secret = values.secret
        if (Object.keys(config).length > 0) body.config = config
      }

      if (destination?.type === 'postgres') {
        const config: Record<string, string> = {}
        if (values.pgUrl) config.url = values.pgUrl
        if (values.table?.trim()) config.table = values.table.trim()
        if (Object.keys(config).length > 0) body.config = config
      }

      if (destination?.type === 'slack') {
        const config: Record<string, string> = {}
        if (values.slackUrl) config.url = values.slackUrl
        if (values.slackChannel?.trim()) config.channel = values.slackChannel.trim()
        if (Object.keys(config).length > 0) body.config = config
      }

      if (destination?.type === 'discord') {
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

  const formik = useFormik<FormValues>({
    initialValues: { name: destination?.name ?? '', webhookUrl: '', secret: '', pgUrl: '', table: '', slackUrl: '', slackChannel: '', discordUrl: '', discordUsername: '' },
    enableReinitialize: true,
    validationSchema: toFormikValidationSchema(schema),
    onSubmit: async (values) => {
      try {
        await mutation.mutateAsync(values)
      } catch {
        // handled in mutation.onError
      }
    },
  })

  if (!open || !destination) return null

  const isWebhook = destination.type === 'webhook'
  const isPostgres = destination.type === 'postgres'
  const isSlack = destination.type === 'slack'
  const isDiscord = destination.type === 'discord'

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
          {/* Name */}
          <div>
            <label htmlFor="edit-dest-name" className="block text-sm font-medium text-gray-700 mb-1">
              Name
            </label>
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

          {/* Type — read-only */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <div className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-500 bg-gray-50">
              {destination.type}
            </div>
            <p className="mt-1 text-xs text-gray-400">
              Type cannot be changed. Delete and recreate to use a different type.
            </p>
          </div>

          {/* Webhook fields */}
          {isWebhook && (
            <>
              <div>
                <label htmlFor="edit-webhook-url" className="block text-sm font-medium text-gray-700 mb-1">
                  Webhook URL
                </label>
                <input
                  id="edit-webhook-url"
                  type="url"
                  {...formik.getFieldProps('webhookUrl')}
                  placeholder="Leave blank to keep existing URL"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                {formik.touched.webhookUrl && formik.errors.webhookUrl && (
                  <p className="mt-1 text-sm text-red-600">{formik.errors.webhookUrl}</p>
                )}
              </div>

              <div>
                <label htmlFor="edit-secret" className="block text-sm font-medium text-gray-700 mb-1">
                  Signing secret{' '}
                  <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <div className="relative">
                  <input
                    id="edit-secret"
                    type={showSecret ? 'text' : 'password'}
                    {...formik.getFieldProps('secret')}
                    placeholder="Leave blank to keep existing secret"
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
                <p className="mt-1 text-xs text-gray-400">
                  Filling this field replaces the stored secret and resets the connection status to untested.
                </p>
              </div>
            </>
          )}

          {/* Postgres fields */}
          {isPostgres && (
            <>
              <div>
                <label htmlFor="edit-pg-url" className="block text-sm font-medium text-gray-700 mb-1">
                  Connection URL
                </label>
                <div className="relative">
                  <input
                    id="edit-pg-url"
                    type={showPgUrl ? 'text' : 'password'}
                    {...formik.getFieldProps('pgUrl')}
                    placeholder="Leave blank to keep existing URL"
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
                <p className="mt-1 text-xs text-gray-400">
                  Filling this field replaces the stored URL and resets the connection status to untested.
                </p>
              </div>

              <div>
                <label htmlFor="edit-table" className="block text-sm font-medium text-gray-700 mb-1">
                  Table name{' '}
                  <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  id="edit-table"
                  type="text"
                  {...formik.getFieldProps('table')}
                  placeholder="Leave blank to keep existing table"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
            </>
          )}

          {/* Slack fields */}
          {isSlack && (
            <>
              <div>
                <label htmlFor="edit-slack-url" className="block text-sm font-medium text-gray-700 mb-1">
                  Slack Webhook URL
                </label>
                <input
                  id="edit-slack-url"
                  type="url"
                  {...formik.getFieldProps('slackUrl')}
                  placeholder="Leave blank to keep existing URL"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                {formik.touched.slackUrl && formik.errors.slackUrl && (
                  <p className="mt-1 text-sm text-red-600">{formik.errors.slackUrl}</p>
                )}
                <p className="mt-1 text-xs text-gray-400">
                  Filling this field replaces the stored URL and resets the connection status to untested.
                </p>
              </div>

              <div>
                <label htmlFor="edit-slack-channel" className="block text-sm font-medium text-gray-700 mb-1">
                  Channel{' '}
                  <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  id="edit-slack-channel"
                  type="text"
                  {...formik.getFieldProps('slackChannel')}
                  placeholder="Leave blank to keep existing channel"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
            </>
          )}

          {/* Discord fields */}
          {isDiscord && (
            <>
              <div>
                <label htmlFor="edit-discord-url" className="block text-sm font-medium text-gray-700 mb-1">
                  Discord Webhook URL
                </label>
                <input
                  id="edit-discord-url"
                  type="url"
                  {...formik.getFieldProps('discordUrl')}
                  placeholder="Leave blank to keep existing URL"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                {formik.touched.discordUrl && formik.errors.discordUrl && (
                  <p className="mt-1 text-sm text-red-600">{formik.errors.discordUrl}</p>
                )}
                <p className="mt-1 text-xs text-gray-400">
                  Filling this field replaces the stored URL and resets the connection status to untested.
                </p>
              </div>

              <div>
                <label htmlFor="edit-discord-username" className="block text-sm font-medium text-gray-700 mb-1">
                  Bot display name{' '}
                  <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  id="edit-discord-username"
                  type="text"
                  {...formik.getFieldProps('discordUsername')}
                  placeholder="Leave blank to keep existing name"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
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
              {formik.isSubmitting ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
