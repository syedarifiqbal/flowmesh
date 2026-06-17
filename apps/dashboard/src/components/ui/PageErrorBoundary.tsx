import { Component, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

interface Props {
  children: ReactNode
  locationKey: string
}

interface State {
  hasError: boolean
  locationKey: string
}

export default class PageErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, locationKey: props.locationKey }
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.locationKey !== state.locationKey) {
      return { hasError: false, locationKey: props.locationKey }
    }
    return null
  }

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true }
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-4">
            <AlertTriangle className="w-6 h-6 text-red-500" />
          </div>
          <p className="text-sm font-medium text-gray-900 mb-1">Something went wrong</p>
          <p className="text-sm text-gray-500 mb-6 max-w-xs">
            This page encountered an unexpected error. Try refreshing, or navigate to another page.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
          >
            Refresh page
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
