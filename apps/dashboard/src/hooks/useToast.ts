import { useState, useCallback } from 'react'

export type ToastVariant = 'success' | 'error' | 'info'

export interface Toast {
  id: string
  title: string
  variant: ToastVariant
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const toast = useCallback(({ title, variant }: { title: string; variant: ToastVariant }) => {
    const id = crypto.randomUUID()
    setToasts((prev) => {
      const next = [...prev, { id, title, variant }]
      return next.slice(-3)
    })
    const duration = variant === 'error' ? 5000 : 3000
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, duration)
  }, [])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return { toasts, toast, dismiss }
}
