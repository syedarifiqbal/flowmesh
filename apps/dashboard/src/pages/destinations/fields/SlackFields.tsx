interface Formik {
  getFieldProps: (field: string) => object
  touched: Record<string, boolean | undefined>
  errors: Record<string, string | undefined>
}

interface Props {
  formik: Formik
  mode: 'create' | 'edit'
}

const INPUT = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent'

export default function SlackFields({ formik, mode }: Props) {
  const isEdit = mode === 'edit'

  return (
    <>
      {!isEdit && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          Create an incoming webhook in your Slack workspace at{' '}
          <a href="https://api.slack.com/apps" target="_blank" rel="noopener noreferrer" className="underline font-medium">
            api.slack.com/apps
          </a>
          , then paste the webhook URL below.
        </div>
      )}

      <div>
        <label htmlFor="dest-slack-url" className="block text-sm font-medium text-gray-700 mb-1">
          Slack Webhook URL
        </label>
        <input
          id="dest-slack-url"
          type="url"
          {...formik.getFieldProps('slackUrl')}
          placeholder={isEdit ? 'Leave blank to keep existing URL' : 'https://hooks.slack.com/services/T.../B.../...'}
          className={INPUT}
        />
        {formik.touched['slackUrl'] && formik.errors['slackUrl'] && (
          <p className="mt-1 text-sm text-red-600">{formik.errors['slackUrl']}</p>
        )}
        <p className="mt-1 text-xs text-gray-500">
          {isEdit
            ? 'Filling this field replaces the stored URL and resets the connection status to untested.'
            : 'The URL is encrypted at rest and never returned after saving.'}
        </p>
      </div>

      <div>
        <label htmlFor="dest-slack-channel" className="block text-sm font-medium text-gray-700 mb-1">
          Channel <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <input
          id="dest-slack-channel"
          type="text"
          {...formik.getFieldProps('slackChannel')}
          placeholder={isEdit ? 'Leave blank to keep existing channel' : '#alerts'}
          className={INPUT}
        />
        {!isEdit && (
          <p className="mt-1 text-xs text-gray-500">
            Overrides the default channel set on the webhook. Leave blank to use the webhook default.
          </p>
        )}
      </div>
    </>
  )
}
