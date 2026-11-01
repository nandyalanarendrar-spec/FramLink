import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { io } from 'socket.io-client'
import { api } from '../api/client'
import { useAuth } from './AuthContext'

export interface Notice {
  _id: string
  type: string
  title: string
  message: string
  link?: string
  read: boolean
  createdAt: string
}

interface NotificationState {
  items: Notice[]
  unread: number
  toast: Notice | null
  dismissToast: () => void
  markRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
  refresh: () => Promise<void>
}

const Ctx = createContext<NotificationState | null>(null)

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [items, setItems] = useState<Notice[]>([])
  const [unread, setUnread] = useState(0)
  const [toast, setToast] = useState<Notice | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get('/notifications', { params: { limit: 50 } })
      setItems(data.notifications)
      setUnread(data.unread)
    } catch {
      /* the next socket event or refresh will catch up */
    }
  }, [])

  // Open the live connection once the user is logged in and verified; close it on logout
  const userId = user?.emailVerified ? user.id : null
  useEffect(() => {
    if (!userId) {
      setItems([])
      setUnread(0)
      return
    }
    refresh()
    const socket = io({ withCredentials: true })
    socket.on('notification', (n: Notice) => {
      setItems((prev) => [n, ...prev].slice(0, 50))
      setUnread((u) => u + 1)
      setToast(n)
      clearTimeout(toastTimer.current)
      toastTimer.current = setTimeout(() => setToast(null), 6000)
    })
    socket.on('connect', refresh) // pick up anything missed while offline
    return () => {
      clearTimeout(toastTimer.current)
      socket.disconnect()
    }
  }, [userId, refresh])

  const value = useMemo<NotificationState>(
    () => ({
      items,
      unread,
      toast,
      dismissToast: () => setToast(null),
      async markRead(id) {
        setItems((prev) => prev.map((n) => (n._id === id ? { ...n, read: true } : n)))
        const { data } = await api.post(`/notifications/${id}/read`)
        setUnread(data.unread)
      },
      async markAllRead() {
        setItems((prev) => prev.map((n) => ({ ...n, read: true })))
        setUnread(0)
        await api.post('/notifications/read-all')
      },
      refresh,
    }),
    [items, unread, toast, refresh],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useNotifications() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useNotifications must be used inside NotificationProvider')
  return ctx
}

export function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}
