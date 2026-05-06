import { useEffect, useRef, useState, KeyboardEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useFormik } from 'formik'
import { toFormikValidationSchema } from 'zod-formik-adapter'
import { z } from 'zod'
import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import api from '../../lib/api'
import { useToastContext } from '../../components/ui/ToastProvider'

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(255).optional(),
})

type FormValues = z.infer<typeof schema>

interface Destination {
  id: string
  name: string
  type: string
}

interface Props {
  open: boolean
  onClose: () => void
}

export default function CreatePipelineModal({ open, onClose }: Props) {
  const { toast } = useToastContext()
  const queryClient = useQueryClient()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const [events, setEvents] = useState<string[]>([])
  const [eventInput, setEventInput] = useState('')
  const [eventError, setEventError] = useState('')
  const [selectedDestinations, setSelectedDestinations] = useState<string[]>([])

  const { data: destinations } = useQuery<Destination[]>({
    queryKey: ['destinations'],
    queryFn: () => api.get('/destinations').then((r) => r.data),
    enabled: open,
  })

  useEffect(() => {
    if (!open) return
    cancelRef.current?.focus()
    const handleKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open])

  function handleClose() {
    setEvents([])
    setEventInput('')
    setEventError('')
    setSelectedDestinations([])
    formik.resetForm()
    onClose()
  }

  function addEvent() {
    const val = eventInput.trim().toLowerCase()
    if (!val) return
    if (events.includes(val)) {
      setEventInput('')
      return
    }
    setEvents((prev) => [...prev, val])
    setEventInput('')
    setEventError('')
  }

  function removeEvent(event: string) {
    setEvents((prev) => prev.filter((e) => e !== event))
  }

  function handleEventKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      addEvent()
    }
  }

  function toggleDestination(id: string) {
    setSelectedDestinations((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id],
    )
  }

  const mutation = useMutation({
    mutationFn: (payload: {
      name: string
      description: string
      trigger: { type: 'event'; events: string[] }
      steps: { id: string; name: string; type: 'destination'; config: { destinationId: string } }[]
      destinations: string[]
      enabled: boolean
    }) => api.post('/pipelines', payload).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipelines'] })
      toast({ title: 'Pipeline created', variant: 'success' })
      handleClose()
    },
    onError: () => {
      toast({ title: 'Failed to create pipeline', variant: 'error' })
    },
  })

  const formik = useFormik<FormValues>({
    initialValues: { name: '', description: '' },
    validationSchema: toFormikValidationSchema(schema),
    onSubmit: async (values) => {
      if (events.length === 0) {
        setEventError('Add at least one event name')
        return
      }
      try {
        await mutation.mutateAsync({
          name: values.name,
          description: values.description ?? '',
          trigger: { type: 'event', events },
          steps: selectedDestinations.map((destId) => {
            const dest = destinations?.find((d) => d.id === destId)
            return {
              id: crypto.randomUUID(),
              name: dest?.name ?? 'Destination',
              type: 'destination' as const,
              config: { destinationId: destId },
            }
          }),
          destinations: selectedDestinations,
          enabled: true,
        })
      } catch {
        // error handled in mutation.onError
      }
    },
  })

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={handleClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-pipeline-title"
      >
        <h2 id="create-pipeline-title" className="text-base font-semibold text-gray-900 mb-5">
          Create Pipeline
        </h2>

        <form onSubmit={formik.handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="pipeline-name" className="block text-sm font-medium text-gray-700 mb-1">
              Name
            </label>
            <input
              id="pipeline-name"
              type="text"
              {...formik.getFieldProps('name')}
              placeholder="e.g. User signup → Slack"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            {formik.touched.name && formik.errors.name && (
              <p className="mt-1 text-sm text-red-600">{formik.errors.name}</p>
            )}
          </div>

          <div>
            <label htmlFor="pipeline-desc" className="block text-sm font-medium text-gray-700 mb-1">
              Description <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              id="pipeline-desc"
              type="text"
              {...formik.getFieldProps('description')}
              placeholder="What does this pipeline do?"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <div>
            <label htmlFor="pipeline-events" className="block text-sm font-medium text-gray-700 mb-1">
              Trigger events
            </label>
            <div className="flex gap-2">
              <input
                id="pipeline-events"
                type="text"
                value={eventInput}
                onChange={(e) => setEventInput(e.target.value)}
                onKeyDown={handleEventKeyDown}
                placeholder="e.g. user.signup — press Enter to add"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              <button
                type="button"
                onClick={addEvent}
                className="px-3 py-2 text-sm font-medium text-indigo-600 border border-indigo-300 rounded-lg hover:bg-indigo-50 transition-colors"
              >
                Add
              </button>
            </div>
            {eventError && <p className="mt-1 text-sm text-red-600">{eventError}</p>}
            {events.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {events.map((event) => (
                  <span
                    key={event}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs font-mono rounded-full border border-indigo-200"
                  >
                    {event}
                    <button
                      type="button"
                      onClick={() => removeEvent(event)}
                      aria-label={`Remove ${event}`}
                      className="text-indigo-400 hover:text-indigo-700"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="block text-sm font-medium text-gray-700 mb-2">
              Destinations <span className="text-gray-400 font-normal">(optional)</span>
            </p>

            {destinations && destinations.length === 0 && (
              <p className="text-xs text-gray-500">
                No destinations yet.{' '}
                <Link
                  to="/destinations"
                  onClick={handleClose}
                  className="text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  Create one first
                </Link>{' '}
                then come back.
              </p>
            )}

            {destinations && destinations.length > 0 && (
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {destinations.map((dest) => (
                  <label
                    key={dest.id}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedDestinations.includes(dest.id)}
                      onChange={() => toggleDestination(dest.id)}
                      className="w-4 h-4 text-indigo-600 border-gray-300 rounded"
                    />
                    <span className="text-sm text-gray-800">{dest.name}</span>
                    <span className="ml-auto text-xs px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded-full border border-indigo-200">
                      {dest.type}
                    </span>
                  </label>
                ))}
              </div>
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
              {formik.isSubmitting ? 'Creating...' : 'Create pipeline'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
