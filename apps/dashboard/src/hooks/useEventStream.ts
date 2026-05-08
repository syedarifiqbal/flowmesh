import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import axios from 'axios'
import { getToken, getRefreshToken, setTokens, clearTokens } from '../lib/auth'

export interface LiveEvent {
  id: string
  eventId: string
  eventName: string
  source: string
  userId: string | null
  anonymousId: string | null
  correlationId: string
  properties: Record<string, unknown>
  receivedAt: string
  workspaceId: string
}

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'

const ANALYTICS_URL = import.meta.env.VITE_ANALYTICS_URL ?? 'http://localhost:3006'
const MAX_LIVE_EVENTS = 100

async function refreshAccessToken(): Promise<string | null> {
  try {
    const refreshToken = getRefreshToken()
    if (!refreshToken) return null
    const { data } = await axios.post<{ accessToken: string; refreshToken: string }>(
      '/api/auth/refresh',
      { refreshToken },
    )
    setTokens(data.accessToken, data.refreshToken)
    return data.accessToken
  } catch {
    return null
  }
}

export function useEventStream() {
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([])
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const socketRef = useRef<Socket | null>(null)
  const refreshAttempted = useRef(false)

  useEffect(() => {
    const token = getToken()
    if (!token) {
      setStatus('disconnected')
      return
    }

    const socket = io(`${ANALYTICS_URL}/events`, {
      auth: { token },
      transports: ['websocket'],
      // Let socket.io auto-reconnect on network drops (ping timeout, transport close)
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 15000,
    })

    socketRef.current = socket

    socket.on('connect', () => {
      refreshAttempted.current = false
      setStatus('connected')
      socket.emit('subscribe')
    })

    socket.on('disconnect', (reason) => {
      // Server-initiated disconnect means auth was rejected — stop reconnecting,
      // try a token refresh, then reconnect manually.
      if (reason === 'io server disconnect') {
        socket.io.opts.reconnection = false
        setStatus('disconnected')
        refreshAccessToken().then((newToken) => {
          if (newToken) {
            socket.auth = { token: newToken }
            socket.io.opts.reconnection = true
            socket.connect()
          } else {
            clearTokens()
            window.location.href = '/login'
          }
        })
      } else {
        // Network drop — socket.io auto-reconnects, show connecting state
        setStatus('connecting')
      }
    })

    socket.on('connect_error', async () => {
      // Fires when a connection attempt fails (e.g. token expired before first connect)
      if (!refreshAttempted.current) {
        refreshAttempted.current = true
        const newToken = await refreshAccessToken()
        if (newToken) {
          socket.auth = { token: newToken }
          // socket.io will retry automatically — no need to call socket.connect()
        } else {
          socket.disconnect()
          clearTokens()
          window.location.href = '/login'
        }
      }
      setStatus('connecting')
    })

    socket.on('event', (event: LiveEvent) => {
      setLiveEvents((prev) => {
        const next = [event, ...prev]
        return next.length > MAX_LIVE_EVENTS ? next.slice(0, MAX_LIVE_EVENTS) : next
      })
    })

    return () => {
      socket.disconnect()
    }
  }, [])

  return { liveEvents, status }
}
