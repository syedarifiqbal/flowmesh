import { Eye, EyeOff } from 'lucide-react'

interface Formik {
  getFieldProps: (field: string) => object
  touched: Record<string, boolean | undefined>
  errors: Record<string, string | undefined>
}

interface Props {
  formik: Formik
  mode: 'create' | 'edit'
  showPgUrl: boolean
  onTogglePgUrl: () => void
}

const INPUT = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent'

export default function PostgresFields({ formik, mode, showPgUrl, onTogglePgUrl }: Props) {
  const isEdit = mode === 'edit'

  return (
    <>
      <div>
        <label htmlFor="dest-pg-url" className="block text-sm font-medium text-gray-700 mb-1">
          Connection URL
        </label>
        <div className="relative">
          <input
            id="dest-pg-url"
            type={showPgUrl ? 'text' : 'password'}
            {...formik.getFieldProps('pgUrl')}
            placeholder={isEdit ? 'Leave blank to keep existing URL' : 'postgresql://user:password@host:5432/dbname'}
            className={`${INPUT} pr-10`}
          />
          <button
            type="button"
            onClick={onTogglePgUrl}
            aria-label={showPgUrl ? 'Hide connection URL' : 'Show connection URL'}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            {showPgUrl ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {formik.touched['pgUrl'] && formik.errors['pgUrl'] && (
          <p className="mt-1 text-sm text-red-600">{formik.errors['pgUrl']}</p>
        )}
        <p className="mt-1 text-xs text-gray-500">
          {isEdit
            ? 'Filling this field replaces the stored URL and resets the connection status to untested.'
            : 'Credentials are encrypted at rest and never returned after saving.'}
        </p>
      </div>

      <div>
        <label htmlFor="dest-table" className="block text-sm font-medium text-gray-700 mb-1">
          Table name <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <input
          id="dest-table"
          type="text"
          {...formik.getFieldProps('table')}
          placeholder={isEdit ? 'Leave blank to keep existing table' : 'flowmesh_events'}
          className={INPUT}
        />
        {!isEdit && (
          <p className="mt-1 text-xs text-gray-500">
            Defaults to <code className="bg-gray-100 px-1 rounded">flowmesh_events</code>. Use{' '}
            <code className="bg-gray-100 px-1 rounded">schema.table</code> for schema-qualified names.
          </p>
        )}
      </div>
    </>
  )
}
