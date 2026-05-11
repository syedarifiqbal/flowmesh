import { Eye, EyeOff } from 'lucide-react'

interface Formik {
  getFieldProps: (field: string) => object
  touched: Record<string, boolean | undefined>
  errors: Record<string, string | undefined>
}

interface Props {
  formik: Formik
  mode: 'create' | 'edit'
  showSecret: boolean
  onToggleSecret: () => void
}

const INPUT = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent'

export default function WebhookFields({ formik, mode, showSecret, onToggleSecret }: Props) {
  const isEdit = mode === 'edit'

  return (
    <>
      <div>
        <label htmlFor="dest-webhook-url" className="block text-sm font-medium text-gray-700 mb-1">
          Webhook URL
        </label>
        <input
          id="dest-webhook-url"
          type="url"
          {...formik.getFieldProps('webhookUrl')}
          placeholder={isEdit ? 'Leave blank to keep existing URL' : 'https://your-server.com/webhook'}
          className={INPUT}
        />
        {formik.touched['webhookUrl'] && formik.errors['webhookUrl'] && (
          <p className="mt-1 text-sm text-red-600">{formik.errors['webhookUrl']}</p>
        )}
      </div>

      <div>
        <label htmlFor="dest-secret" className="block text-sm font-medium text-gray-700 mb-1">
          Signing secret <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <div className="relative">
          <input
            id="dest-secret"
            type={showSecret ? 'text' : 'password'}
            {...formik.getFieldProps('secret')}
            placeholder={isEdit ? 'Leave blank to keep existing secret' : 'Used to sign requests with HMAC-SHA256'}
            className={`${INPUT} pr-10`}
          />
          <button
            type="button"
            onClick={onToggleSecret}
            aria-label={showSecret ? 'Hide secret' : 'Show secret'}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {isEdit && (
          <p className="mt-1 text-xs text-gray-400">
            Filling this field replaces the stored secret and resets the connection status to untested.
          </p>
        )}
      </div>
    </>
  )
}
