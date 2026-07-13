import { useFormik } from 'formik'
import { useMutation } from '@tanstack/react-query'
import { X } from 'lucide-react'
import api from '../../lib/api'

type ConditionType = 'any_event' | 'property_equals' | 'count_threshold'
type Channel = 'slack' | 'webhook' | 'email'

type FormValues = {
  name: string
  description: string
  conditionType: ConditionType
  eventName: string
  propertyPath: string
  propertyValue: string
  thresholdCount: string
  windowSeconds: string
  channel: Channel
  slackWebhookUrl: string
  webhookUrl: string
  recipientEmail: string
}

interface Props {
  onClose: () => void
  onCreated: () => void
}

export default function CreateAlertRuleModal({ onClose, onCreated }: Props) {
  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/alert-rules', data),
    onSuccess: onCreated,
  })

  const formik = useFormik<FormValues>({
    initialValues: {
      name: '',
      description: '',
      conditionType: 'any_event',
      eventName: '',
      propertyPath: '',
      propertyValue: '',
      thresholdCount: '',
      windowSeconds: '',
      channel: 'slack',
      slackWebhookUrl: '',
      webhookUrl: '',
      recipientEmail: '',
    },
    validate: (values) => {
      const errors: Record<string, string> = {}
      if (!values.name.trim()) errors.name = 'Name is required'
      if (values.conditionType === 'property_equals') {
        if (!values.propertyPath.trim()) errors.propertyPath = 'Property path is required'
        if (!values.propertyValue.trim()) errors.propertyValue = 'Property value is required'
      }
      if (values.conditionType === 'count_threshold') {
        const count = parseInt(values.thresholdCount)
        if (!values.thresholdCount || isNaN(count) || count < 1) errors.thresholdCount = 'Must be at least 1'
        const window = parseInt(values.windowSeconds)
        if (!values.windowSeconds || isNaN(window) || window < 10) errors.windowSeconds = 'Must be at least 10 seconds'
      }
      if (values.channel === 'slack' && !values.slackWebhookUrl.trim()) errors.slackWebhookUrl = 'Slack webhook URL is required'
      if (values.channel === 'webhook' && !values.webhookUrl.trim()) errors.webhookUrl = 'Webhook URL is required'
      if (values.channel === 'email' && !values.recipientEmail.trim()) errors.recipientEmail = 'Recipient email is required'
      return errors
    },
    onSubmit: (values) => {
      const payload: Record<string, unknown> = {
        name: values.name,
        conditionType: values.conditionType,
        channel: values.channel,
      }
      if (values.description) payload.description = values.description
      if (values.eventName) payload.eventName = values.eventName
      if (values.conditionType === 'property_equals') {
        payload.propertyPath = values.propertyPath
        payload.propertyValue = values.propertyValue
      }
      if (values.conditionType === 'count_threshold') {
        payload.thresholdCount = parseInt(values.thresholdCount)
        payload.windowSeconds = parseInt(values.windowSeconds)
      }
      if (values.channel === 'slack') payload.slackWebhookUrl = values.slackWebhookUrl
      if (values.channel === 'webhook') payload.webhookUrl = values.webhookUrl
      if (values.channel === 'email') payload.recipientEmail = values.recipientEmail
      mutation.mutate(payload)
    },
  })

  const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-semibold text-gray-900">New Alert Rule</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={formik.handleSubmit} className="px-6 py-5 space-y-5 overflow-y-auto">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1" htmlFor="name">Rule name</label>
            <input
              id="name"
              type="text"
              {...formik.getFieldProps('name')}
              placeholder="e.g. Payment failures"
              className={inputCls}
            />
            {formik.touched.name && formik.errors.name && (
              <p className="mt-1 text-xs text-red-600">{formik.errors.name}</p>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1" htmlFor="description">
              Description <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              id="description"
              type="text"
              {...formik.getFieldProps('description')}
              placeholder="What does this rule watch for?"
              className={inputCls}
            />
          </div>

          {/* Condition */}
          <div className="border border-gray-100 rounded-lg p-4 space-y-4 bg-gray-50">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Condition</p>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Trigger when</label>
              <select
                {...formik.getFieldProps('conditionType')}
                className={inputCls}
              >
                <option value="any_event">Any matching event arrives</option>
                <option value="property_equals">Event property equals a value</option>
                <option value="count_threshold">Event count exceeds threshold</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1" htmlFor="eventName">
                Event name <span className="text-gray-400 font-normal">(optional — leave blank to match all)</span>
              </label>
              <input
                id="eventName"
                type="text"
                {...formik.getFieldProps('eventName')}
                placeholder="e.g. payment.failed"
                className={`${inputCls} font-mono`}
              />
            </div>

            {formik.values.conditionType === 'property_equals' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1" htmlFor="propertyPath">Property path</label>
                  <input
                    id="propertyPath"
                    type="text"
                    {...formik.getFieldProps('propertyPath')}
                    placeholder="e.g. plan"
                    className={`${inputCls} font-mono`}
                  />
                  {formik.touched.propertyPath && formik.errors.propertyPath && (
                    <p className="mt-1 text-xs text-red-600">{formik.errors.propertyPath}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1" htmlFor="propertyValue">Equals value</label>
                  <input
                    id="propertyValue"
                    type="text"
                    {...formik.getFieldProps('propertyValue')}
                    placeholder="e.g. pro"
                    className={`${inputCls} font-mono`}
                  />
                  {formik.touched.propertyValue && formik.errors.propertyValue && (
                    <p className="mt-1 text-xs text-red-600">{formik.errors.propertyValue}</p>
                  )}
                </div>
              </div>
            )}

            {formik.values.conditionType === 'count_threshold' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1" htmlFor="thresholdCount">
                    Fire after N events
                  </label>
                  <input
                    id="thresholdCount"
                    type="number"
                    min={1}
                    {...formik.getFieldProps('thresholdCount')}
                    placeholder="e.g. 10"
                    className={inputCls}
                  />
                  {formik.touched.thresholdCount && formik.errors.thresholdCount && (
                    <p className="mt-1 text-xs text-red-600">{formik.errors.thresholdCount}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1" htmlFor="windowSeconds">
                    Within seconds
                  </label>
                  <input
                    id="windowSeconds"
                    type="number"
                    min={10}
                    {...formik.getFieldProps('windowSeconds')}
                    placeholder="e.g. 60"
                    className={inputCls}
                  />
                  {formik.touched.windowSeconds && formik.errors.windowSeconds && (
                    <p className="mt-1 text-xs text-red-600">{formik.errors.windowSeconds}</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Notification */}
          <div className="border border-gray-100 rounded-lg p-4 space-y-4 bg-gray-50">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Notification</p>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Notify via</label>
              <div className="flex gap-4">
                {(['slack', 'webhook', 'email'] as const).map((ch) => (
                  <label key={ch} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="channel"
                      value={ch}
                      checked={formik.values.channel === ch}
                      onChange={() => formik.setFieldValue('channel', ch)}
                      className="accent-indigo-600"
                    />
                    <span className="text-sm capitalize">{ch}</span>
                  </label>
                ))}
              </div>
            </div>

            {formik.values.channel === 'slack' && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1" htmlFor="slackWebhookUrl">
                  Slack Incoming Webhook URL
                </label>
                <input
                  id="slackWebhookUrl"
                  type="url"
                  {...formik.getFieldProps('slackWebhookUrl')}
                  placeholder="https://hooks.slack.com/services/…"
                  className={inputCls}
                />
                {formik.touched.slackWebhookUrl && formik.errors.slackWebhookUrl && (
                  <p className="mt-1 text-xs text-red-600">{formik.errors.slackWebhookUrl}</p>
                )}
              </div>
            )}

            {formik.values.channel === 'webhook' && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1" htmlFor="webhookUrl">
                  Webhook URL
                </label>
                <input
                  id="webhookUrl"
                  type="url"
                  {...formik.getFieldProps('webhookUrl')}
                  placeholder="https://your-server.com/alerts"
                  className={inputCls}
                />
                {formik.touched.webhookUrl && formik.errors.webhookUrl && (
                  <p className="mt-1 text-xs text-red-600">{formik.errors.webhookUrl}</p>
                )}
              </div>
            )}

            {formik.values.channel === 'email' && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1" htmlFor="recipientEmail">
                  Recipient email
                </label>
                <input
                  id="recipientEmail"
                  type="email"
                  {...formik.getFieldProps('recipientEmail')}
                  placeholder="you@example.com"
                  className={inputCls}
                />
                {formik.touched.recipientEmail && formik.errors.recipientEmail && (
                  <p className="mt-1 text-xs text-red-600">{formik.errors.recipientEmail}</p>
                )}
              </div>
            )}
          </div>

          {mutation.isError && (
            <p className="text-sm text-red-500">Failed to create rule. Please try again.</p>
          )}

          {/* Footer */}
          <div className="flex justify-end gap-3 pt-1 pb-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={formik.isSubmitting || mutation.isPending}
              className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-60"
            >
              {mutation.isPending ? 'Creating…' : 'Create Rule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
