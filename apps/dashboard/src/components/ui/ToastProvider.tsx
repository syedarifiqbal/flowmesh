import { createContext, useContext, ReactNode } from 'react'
import { useToast, Toast, ToastVariant } from '../../hooks/useToast'
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react'

interface ToastContextValue {
  toast: (opts: { title: string; variant: ToastVariant }) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToastContext() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToastContext must be used within ToastProvider')
  return ctx
}

const icons: Record<ToastVariant, React.ReactNode> = {
  success: <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />,
  error: <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />,
  info: <Info className="w-4 h-4 text-blue-500 shrink-0" />,
}

const styles: Record<ToastVariant, string> = {
  success: 'border-green-200 bg-white',
  error: 'border-red-200 bg-white',
  info: 'border-blue-200 bg-white',
}

function ToastItem({ t, onDismiss }: { t: Toast; onDismiss: (id: string) => void }) {
  return (
    <div className={`flex items-start gap-3 px-4 py-3 rounded-lg border shadow-md min-w-64 max-w-sm ${styles[t.variant]}`}>
      {icons[t.variant]}
      <p className="text-sm text-gray-800 flex-1">{t.title}</p>
      <button
        onClick={() => onDismiss(t.id)}
        aria-label="Dismiss notification"
        className="text-gray-400 hover:text-gray-600 shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const { toasts, toast, dismiss } = useToast()

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50">
        {toasts.map((t) => (
          <ToastItem key={t.id} t={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}
