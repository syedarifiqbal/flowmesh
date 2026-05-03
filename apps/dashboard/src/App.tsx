import AppRouter from './router'
import { ToastProvider } from './components/ui/ToastProvider'

export default function App() {
  return (
    <ToastProvider>
      <AppRouter />
    </ToastProvider>
  )
}
