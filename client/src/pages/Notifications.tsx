import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck } from 'lucide-react'
import { timeAgo, useNotifications } from '../context/NotificationContext'

export default function Notifications() {
  const { t } = useTranslation()
  const { items, unread, markRead, markAllRead } = useNotifications()
  const navigate = useNavigate()

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('Notifications')}</h1>
          <p className="text-sm text-slate-500">{unread > 0 ? t('{{n}} unread', { n: unread }) : t('Everything is read')}</p>
        </div>
        {unread > 0 && <button className="btn-outline gap-2" onClick={markAllRead}><CheckCheck size={16} /> {t('Mark all as read')}</button>}
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <Bell className="mx-auto text-slate-400" size={32} />
          <p className="mt-2 font-semibold">{t('No notifications yet')}</p>
          <p className="text-sm text-slate-500">{t('Requests, offers, order and transport updates will show up here instantly.')}</p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {items.map((n) => (
            <li key={n._id}>
              <button
                onClick={() => { if (!n.read) markRead(n._id); if (n.link) navigate(n.link) }}
                className={`flex w-full gap-3 px-5 py-4 text-left transition hover:bg-slate-50 ${n.read ? '' : 'bg-brand-50/50'}`}
              >
                <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${n.read ? 'bg-transparent' : 'bg-brand-600'}`} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{n.title}</span>
                    <span className="shrink-0 text-xs text-slate-400">{timeAgo(n.createdAt)}</span>
                  </span>
                  <span className="block text-sm text-slate-600">{n.message}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
