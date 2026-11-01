import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, X } from 'lucide-react'
import { timeAgo, useNotifications } from '../context/NotificationContext'
import type { Notice } from '../context/NotificationContext'
import { useAuth } from '../context/AuthContext'

export function NotificationBell() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { items, unread, markRead, markAllRead } = useNotifications()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  function openItem(n: Notice) {
    if (!n.read) markRead(n._id)
    setOpen(false)
    if (n.link) navigate(n.link)
  }

  return (
    <div ref={box} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label={t('Notifications, {{n}} unread', { n: unread })}>
        <Bell size={20} />
        {unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid min-h-4 min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="font-semibold">{t('Notifications')}</p>
            {unread > 0 && <button onClick={markAllRead} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"><CheckCheck size={14} /> {t('Mark all read')}</button>}
          </div>
          <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
            {items.length === 0 && <li className="p-6 text-center text-sm text-slate-500">{t('You are all caught up.')}</li>}
            {items.slice(0, 8).map((n) => (
              <li key={n._id}>
                <button onClick={() => openItem(n)} className={`flex w-full gap-3 px-4 py-3 text-left hover:bg-slate-50 ${n.read ? '' : 'bg-brand-50/50'}`}>
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? 'bg-transparent' : 'bg-brand-600'}`} />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{n.title}</span>
                    <span className="block text-sm text-slate-600">{n.message}</span>
                    <span className="block text-xs text-slate-400">{timeAgo(n.createdAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Link to={`/${user?.role}/notifications`} onClick={() => setOpen(false)} className="block border-t border-slate-100 px-4 py-2.5 text-center text-sm font-semibold text-brand-700 hover:bg-slate-50">{t('View all')}</Link>
        </div>
      )}
    </div>
  )
}

// Small pop-up when a new notification arrives live
export function NotificationToast() {
  const { t } = useTranslation()
  const { toast, dismissToast, markRead } = useNotifications()
  const navigate = useNavigate()
  if (!toast) return null

  return (
    <div className="fixed right-4 top-4 z-[60] w-80 max-w-[calc(100vw-2rem)] animate-fade-up rounded-xl border border-brand-100 bg-white p-4 shadow-xl" role="status">
      <button onClick={dismissToast} className="absolute right-2 top-2 text-slate-400 hover:text-slate-600" aria-label={t('Dismiss')}><X size={16} /></button>
      <button className="block w-full pr-4 text-left" onClick={() => { markRead(toast._id); dismissToast(); if (toast.link) navigate(toast.link) }}>
        <span className="flex items-center gap-2 text-sm font-semibold text-brand-800"><Bell size={15} /> {toast.title}</span>
        <span className="mt-1 block text-sm text-slate-600">{toast.message}</span>
      </button>
    </div>
  )
}
