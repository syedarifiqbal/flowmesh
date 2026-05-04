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
  type: z.literal('webhook'),
  url: z.string().url('Enter a valid URL'),
  secret: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface Props {
  open: boolean
  onClose: () => void
}

export default function CreateDestinationModal({ open, onClose }: Props) {
  const { toast } = useToastContext()
  const queryClient = useQueryClient()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const [showSecret, setShowSecret] = useState(false)

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
    formik.resetForm()
    onClose()
  }

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      api
        .post('/destinations', {
          name: values.name,
          type: values.type,
          config: {
            url: values.url,
            ...(values.secret ? { secret: values.secret } : {}),
          },
        })
        .then((r) => r.data),
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
    initialValues: { name: '', type: 'webhook', url: '', secret: '' },
    validationSchema: toFormikValidationSchema(schema),
    onSubmit: async (values) => {
      try {
        await mutation.mutateAsync(values)
      } catch {
        // handled in mutation.onError
      }
    },
  })

  if (!open) return null

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
            <label htmlFor="dest-name" className="block text-sm font-medium text-gray-700 mb-1">
              Name
            </label>
            <input
              id="dest-name"
              type="text"
              {...formik.getFieldProps('name')}
              placeholder="e.g. Production Webhook"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            {formik.touched.name && formik.errors.name && (
              <p className="mt-1 text-sm text-red-600">{formik.errors.name}</p>
            )}
          </div>

          <div>
            <label htmlFor="dest-type" className="block text-sm font-medium text-gray-700 mb-1">
              Type
            </label>
            <select
              id="dest-type"
              {...formik.getFieldProps('type')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="webhook">Webhook</option>
            </select>
          </div>

          <div>
            <label htmlFor="dest-url" className="block text-sm font-medium text-gray-700 mb-1">
              Webhook URL
            </label>
            <input
              id="dest-url"
              type="url"
              {...formik.getFieldProps('url')}
              placeholder="https://your-server.com/webhook"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            {formik.touched.url && formik.errors.url && (
              <p className="mt-1 text-sm text-red-600">{formik.errors.url}</p>
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
