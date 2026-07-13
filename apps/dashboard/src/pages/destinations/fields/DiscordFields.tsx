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

export default function DiscordFields({ formik, mode }: Props) {
  const isEdit = mode === 'edit'

  return (
    <>
      {!isEdit && (
        <div className="rounded-lg bg-indigo-50 border border-indigo-200 px-4 py-3 text-sm text-indigo-800">
          Create a webhook in your Discord server under{' '}
          <strong>Server Settings → Integrations → Webhooks</strong>, then paste the URL below.
        </div>
      )}

      <div>
        <label htmlFor="dest-discord-url" className="block text-sm font-medium text-gray-700 mb-1">
          Discord Webhook URL
        </label>
        <input
          id="dest-discord-url"
          type="url"
          {...formik.getFieldProps('discordUrl')}
          placeholder={isEdit ? 'Leave blank to keep existing URL' : 'https://discord.com/api/webhooks/...'}
          className={INPUT}
        />
        {formik.touched['discordUrl'] && formik.errors['discordUrl'] && (
          <p className="mt-1 text-sm text-red-600">{formik.errors['discordUrl']}</p>
        )}
        <p className="mt-1 text-xs text-gray-500">
          {isEdit
            ? 'Filling this field replaces the stored URL and resets the connection status to untested.'
            : 'The URL is encrypted at rest and never returned after saving.'}
        </p>
      </div>

      <div>
        <label htmlFor="dest-discord-username" className="block text-sm font-medium text-gray-700 mb-1">
          Bot display name <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <input
          id="dest-discord-username"
          type="text"
          {...formik.getFieldProps('discordUsername')}
          placeholder={isEdit ? 'Leave blank to keep existing name' : 'FlowMesh'}
          className={INPUT}
        />
        {!isEdit && (
          <p className="mt-1 text-xs text-gray-500">Overrides the default name set on the webhook.</p>
        )}
      </div>
    </>
  )
}
