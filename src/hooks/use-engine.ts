'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { io, type Socket } from 'socket.io-client'
import type { ControlAction, EngineState } from '@/lib/engine-types'

export function useEngineSocket() {
  const [state, setState] = useState<EngineState | null>(null)
  const [connected, setConnected] = useState(false)
  const [booting, setBooting] = useState(true)
  const socketRef = useRef<Socket | null>(null)
  const startedRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    const connect = () => {
      if (cancelled) return
      const s = io('/?XTransformPort=3003', {
        transports: ['websocket', 'polling'],
        forceNew: true,
        reconnection: true,
        reconnectionAttempts: 8,
        reconnectionDelay: 1200,
        timeout: 8000,
      })
      socketRef.current = s

      s.on('connect', () => {
        setConnected(true)
        setBooting(false)
        s.emit('hello')
      })
      s.on('disconnect', () => setConnected(false))
      s.on('state', (snapshot: EngineState) => {
        setState(snapshot)
        setBooting(false)
      })
      s.on('connect_error', () => {
        setConnected(false)
        // engine mungkin mati — coba bangunkan via API route sekali per sesi koneksi
        if (!startedRef.current) {
          startedRef.current = true
          fetch('/api/engine', { method: 'POST' })
            .then(() => {
              retryTimer = setTimeout(() => {
                startedRef.current = false
                if (!cancelled && !s.connected) s.connect()
              }, 1500)
            })
            .catch(() => {
              startedRef.current = false
            })
        }
      })
    }

    // pastikan engine hidup sebelum koneksi pertama
    fetch('/api/engine', { method: 'POST' })
      .catch(() => null)
      .finally(() => {
        if (!cancelled) connect()
      })

    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
      socketRef.current?.disconnect()
      socketRef.current = null
    }
  }, [])

  const sendControl = useCallback((cmd: ControlAction) => {
    socketRef.current?.emit('control', cmd)
  }, [])

  return { state, connected, booting, sendControl }
}
