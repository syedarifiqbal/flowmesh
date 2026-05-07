import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { getToken } from '../lib/auth'

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

export function useEventStream() {
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([])
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    const token = getToken()
    if (!token) {
      setStatus('disconnected')
      return
    }

    const socket = io(`${ANALYTICS_URL}/events`, {
      auth: { token },
      transports: ['websocket'],
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    })

    socketRef.current = socket

    socket.on('connect', () => {
      setStatus('connected')
      socket.emit('subscribe')
    })

    socket.on('disconnect', () => setStatus('disconnected'))
    socket.on('connect_error', () => setStatus('disconnected'))

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
