import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { PackageOpen } from 'lucide-react'
import { api, errorMessage } from '../api/client'
import { fmtDate, inr } from '../api/crops'
import { orderStatusMeta } from '../api/orders'
import type { Order, OrderSummary } from '../api/orders'
import { useAuth } from '../context/AuthContext'
import { T, dateLocale } from '../i18n'

type Tab = 'active' | 'history'

const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString(dateLocale(), { month: 'short', year: '2-digit', timeZone: 'UTC' })

function SummaryPanel({ role }: { role: 'farmer' | 'buyer' }) {
  const { t } = useTranslation()
  const [s, setS] = useState<OrderSummary | null>(null)
  useEffect(() => { api.get('/orders/summary').then(({ data }) => setS(data)).catch(() => {}) }, [])
  if (!s) return null

  const label = role === 'farmer'
    ? { value: T('Total sales'), kg: T('Sold'), unpaid: T('Payment to receive') }
    : { value: T('Total spent'), kg: T('Purchased'), unpaid: T('Payment pending') }
  const maxMonth = Math.max(...s.byMonth.map((m) => m.value), 1)
  const maxCrop = Math.max(...s.byCrop.map((c) => c.value), 1)

  return (
    <section className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          [label.value, inr(s.value)],
          [label.kg, t('{{n}} kg', { n: s.quantity.toLocaleString('en-IN') })],
          [T('Completed orders'), String(s.orders)],
          [label.unpaid, inr(s.unpaid.value)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-2xl font-bold text-brand-700">{v}</p>
            <p className="mt-1 text-sm text-slate-500">{t(k)}</p>
          </div>
        ))}
      </div>
      {s.orders > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-sm font-semibold">{t('By crop')}</p>
            <ul className="mt-3 space-y-2">
              {s.byCrop.map((c) => (
                <li key={c.crop} className="text-sm">
                  <div className="flex justify-between"><span>{c.crop}</span><span className="text-slate-500">{inr(c.value)} · {t('{{n}} kg', { n: c.quantity.toLocaleString('en-IN') })}</span></div>
                  <div className="mt-1 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-brand-500" style={{ width: `${(c.value / maxCrop) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-sm font-semibold">{t('Last months')}</p>
            <div className="mt-3 flex h-28 items-end gap-3">
              {s.byMonth.map((m) => (
                <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-[11px] text-slate-500">{inr(m.value)}</span>
                  <div className="w-full max-w-14 rounded-t bg-brand-500" style={{ height: `${Math.max((m.value / maxMonth) * 64, 4)}px` }} />
                  <span className="text-xs text-slate-500">{monthLabel(m.month)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

// Shared by the farmer's "Orders" + "Sales History" and the buyer's "Orders" pages
export default function OrderList({ title, subtitle, initialTab = 'active' }: { title: string; subtitle: string; initialTab?: Tab }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const role = user?.role === 'farmer' ? 'farmer' : 'buyer'
  const [tab, setTab] = useState<Tab>(initialTab)
  const [orders, setOrders] = useState<Order[]>([])
  const [counts, setCounts] = useState({ active: 0, history: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    api.get('/orders/mine', { params: { tab } })
      .then(({ data }) => { setOrders(data.orders); setCounts(data.counts) })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false))
  }, [tab])

  const tabList: [Tab, string][] = [['active', T('Active')], ['history', role === 'farmer' ? T('Sales history') : T('Purchase history')]]

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">{t(title)}</h1>
        <p className="text-sm text-slate-500">{t(subtitle)}</p>
      </div>

      <div className="flex gap-2">
        {tabList.map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)} className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${tab === v ? 'bg-brand-600 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
            {t(l)} <span className="opacity-70">({counts[v]})</span>
          </button>
        ))}
      </div>

      {tab === 'history' && <SummaryPanel role={role} />}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {loading ? (
        <p className="text-slate-500">{t('Loading…')}</p>
      ) : orders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <PackageOpen className="mx-auto text-slate-400" size={32} />
          <p className="mt-2 font-semibold">{tab === 'active' ? t('No active orders') : t('No completed or cancelled orders yet')}</p>
          <p className="text-sm text-slate-500">{t('Orders appear here once a purchase request is accepted.')}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {orders.map((o) => (
            <li key={o._id}>
              <Link to={`/${role}/orders/${o._id}`} className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 transition hover:shadow-md">
                <div className="min-w-40 flex-1">
                  <p className="font-bold">{o.crop}</p>
                  <p className="text-sm text-slate-500">{role === 'farmer' ? t('To') : t('From')} {o.counterpart.name} · {fmtDate(o.createdAt)}</p>
                </div>
                <div className="text-sm">
                  <p className="font-semibold">{o.quantity.toLocaleString('en-IN')} kg × {inr(o.price)}</p>
                  <p className="text-slate-500">{t('Total {{n}}', { n: inr(o.total) })}</p>
                </div>
                <div className="flex items-center gap-2">
                  {o.paymentStatus === 'paid' ? <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700">{t('Paid')}</span> : o.status !== 'cancelled' && <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">{t('Payment pending')}</span>}
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${orderStatusMeta[o.status].cls}`}>{t(orderStatusMeta[o.status].label)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
