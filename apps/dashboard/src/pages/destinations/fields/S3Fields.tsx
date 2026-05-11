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

export default function S3Fields({ formik, mode }: Props) {
  const isEdit = mode === 'edit'

  return (
    <>
      {!isEdit && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          Create an IAM user with <code className="font-mono">s3:PutObject</code> permission scoped to your bucket, then paste the credentials below.
          Never use root account credentials.
        </div>
      )}

      <div>
        <label htmlFor="dest-s3-bucket" className="block text-sm font-medium text-gray-700 mb-1">
          Bucket Name
        </label>
        <input
          id="dest-s3-bucket"
          type="text"
          {...formik.getFieldProps('s3Bucket')}
          placeholder={isEdit ? 'Leave blank to keep existing bucket' : 'my-events-bucket'}
          className={INPUT}
        />
        {formik.touched['s3Bucket'] && formik.errors['s3Bucket'] && (
          <p className="mt-1 text-sm text-red-600">{formik.errors['s3Bucket']}</p>
        )}
      </div>

      <div>
        <label htmlFor="dest-s3-region" className="block text-sm font-medium text-gray-700 mb-1">
          Region
        </label>
        <input
          id="dest-s3-region"
          type="text"
          {...formik.getFieldProps('s3Region')}
          placeholder={isEdit ? 'Leave blank to keep existing region' : 'us-east-1'}
          className={INPUT}
        />
        {formik.touched['s3Region'] && formik.errors['s3Region'] && (
          <p className="mt-1 text-sm text-red-600">{formik.errors['s3Region']}</p>
        )}
      </div>

      <div>
        <label htmlFor="dest-s3-access-key-id" className="block text-sm font-medium text-gray-700 mb-1">
          Access Key ID
        </label>
        <input
          id="dest-s3-access-key-id"
          type="text"
          {...formik.getFieldProps('s3AccessKeyId')}
          placeholder={isEdit ? 'Leave blank to keep existing key' : 'AKIAIOSFODNN7EXAMPLE'}
          className={INPUT}
        />
        {formik.touched['s3AccessKeyId'] && formik.errors['s3AccessKeyId'] && (
          <p className="mt-1 text-sm text-red-600">{formik.errors['s3AccessKeyId']}</p>
        )}
      </div>

      <div>
        <label htmlFor="dest-s3-secret-access-key" className="block text-sm font-medium text-gray-700 mb-1">
          Secret Access Key
        </label>
        <input
          id="dest-s3-secret-access-key"
          type="password"
          {...formik.getFieldProps('s3SecretAccessKey')}
          placeholder={isEdit ? 'Leave blank to keep existing secret' : '••••••••••••••••••••••••••••••••••••••••'}
          className={INPUT}
        />
        {formik.touched['s3SecretAccessKey'] && formik.errors['s3SecretAccessKey'] && (
          <p className="mt-1 text-sm text-red-600">{formik.errors['s3SecretAccessKey']}</p>
        )}
        {!isEdit && (
          <p className="mt-1 text-xs text-gray-500">
            Encrypted at rest and never returned after saving.
          </p>
        )}
      </div>

      <div>
        <label htmlFor="dest-s3-prefix" className="block text-sm font-medium text-gray-700 mb-1">
          Key Prefix <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <input
          id="dest-s3-prefix"
          type="text"
          {...formik.getFieldProps('s3Prefix')}
          placeholder={isEdit ? 'Leave blank to keep existing prefix' : 'flowmesh-events'}
          className={INPUT}
        />
        <p className="mt-1 text-xs text-gray-500">
          Events are stored at <code className="font-mono">{'{prefix}/{YYYY}/{MM}/{DD}/{eventId}.json'}</code>. Defaults to <code className="font-mono">flowmesh-events</code>.
        </p>
      </div>
    </>
  )
}
