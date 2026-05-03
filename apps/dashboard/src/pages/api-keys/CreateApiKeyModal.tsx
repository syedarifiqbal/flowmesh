import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useFormik } from 'formik'
import { toFormikValidationSchema } from 'zod-formik-adapter'
import { z } from 'zod'
import { Copy, CheckCircle } from 'lucide-react'
import api from '../../lib/api'
import { useToastContext } from '../../components/ui/ToastProvider'

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(64, 'Name must be under 64 characters'),
})

type FormValues = z.infer<typeof schema>

interface CreatedKey {
  id: string
  name: string
  key: string
}

interface Props {
  open: boolean
  onClose: () => void
}

export default function CreateApiKeyModal({ open, onClose }: Props) {
  const { toast } = useToastContext()
  const queryClient = useQueryClient()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const [createdKey, setCreatedKey] = useState<CreatedKey | null>(null)
  const [copied, setCopied] = useState(false)

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
    setCreatedKey(null)
    setCopied(false)
    formik.resetForm()
    onClose()
  }

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      api.post<CreatedKey>('/api-keys', values).then((r) => r.data),
    onSuccess: (data) => {
      setCreatedKey(data)
      queryClient.invalidateQueries({ queryKey: ['api-keys'] })
      toast({ title: 'API key created', variant: 'success' })
    },
    onError: () => {
      toast({ title: 'Failed to create API key', variant: 'error' })
    },
  })

  const formik = useFormik<FormValues>({
    initialValues: { name: '' },
    validationSchema: toFormikValidationSchema(schema),
    onSubmit: async (values) => {
      try {
        await mutation.mutateAsync(values)
      } catch {
        // error handled in mutation.onError
      }
    },
  })

  async function copyKey() {
    if (!createdKey) return
    await navigator.clipboard.writeText(createdKey.key)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={handleClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-key-title"
      >
        {!createdKey ? (
          <>
            <h2 id="create-key-title" className="text-base font-semibold text-gray-900 mb-4">
              Create API Key
            </h2>
            <form onSubmit={formik.handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="key-name" className="block text-sm font-medium text-gray-700 mb-1">
                  Key name
                </label>
                <input
                  id="key-name"
                  type="text"
                  {...formik.getFieldProps('name')}
                  placeholder="e.g. Production server"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                {formik.touched.name && formik.errors.name && (
                  <p className="mt-1 text-sm text-red-600">{formik.errors.name}</p>
                )}
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
                  {formik.isSubmitting ? 'Creating...' : 'Create key'}
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <h2 id="create-key-title" className="text-base font-semibold text-gray-900">
                Key created
              </h2>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Copy your key now — it will not be shown again.
            </p>
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mb-6">
              <code className="text-xs font-mono text-gray-800 flex-1 break-all">{createdKey.key}</code>
              <button
                onClick={copyKey}
                aria-label="Copy API key"
                className="shrink-0 text-gray-400 hover:text-gray-700 transition-colors"
              >
                {copied ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
            <div className="flex justify-end">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
