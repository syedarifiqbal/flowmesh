import { useNavigate, Link } from 'react-router-dom'
import { useFormik } from 'formik'
import { toFormikValidationSchema } from 'zod-formik-adapter'
import { z } from 'zod'
import api from '../../lib/api'
import { setTokens } from '../../lib/auth'

const registerSchema = z.object({
  workspaceName: z.string().min(1, 'Workspace name is required'),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

type RegisterForm = z.infer<typeof registerSchema>

export default function RegisterPage() {
  const navigate = useNavigate()

  const formik = useFormik<RegisterForm>({
    initialValues: { workspaceName: '', email: '', password: '' },
    validationSchema: toFormikValidationSchema(registerSchema),
    onSubmit: async (values, { setFieldError }) => {
      try {
        await api.post('/auth/register', values)
        const { data } = await api.post('/auth/login', {
          email: values.email,
          password: values.password,
        })
        setTokens(data.accessToken, data.refreshToken)
        localStorage.setItem('workspace_name', values.workspaceName)
        navigate('/dashboard')
      } catch {
        setFieldError('email', 'Registration failed. This email may already be in use.')
      }
    },
  })

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">FlowMesh</h1>
          <p className="text-gray-500 mt-1">Create your workspace</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-8">
          <form onSubmit={formik.handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="workspaceName" className="block text-sm font-medium text-gray-700 mb-1">
                Workspace name
              </label>
              <input
                id="workspaceName"
                type="text"
                {...formik.getFieldProps('workspaceName')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="My Workspace"
              />
              {formik.touched.workspaceName && formik.errors.workspaceName && (
                <p className="mt-1 text-sm text-red-600">{formik.errors.workspaceName}</p>
              )}
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                {...formik.getFieldProps('email')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="you@example.com"
              />
              {formik.touched.email && formik.errors.email && (
                <p className="mt-1 text-sm text-red-600">{formik.errors.email}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                {...formik.getFieldProps('password')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="••••••••"
              />
              {formik.touched.password && formik.errors.password && (
                <p className="mt-1 text-sm text-red-600">{formik.errors.password}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={formik.isSubmitting}
              className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-md transition-colors"
            >
              {formik.isSubmitting ? 'Creating workspace...' : 'Create workspace'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-indigo-600 hover:underline font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
