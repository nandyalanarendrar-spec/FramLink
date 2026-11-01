import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ArrowRight, Store } from 'lucide-react'
import { api } from '../../api/client'
import { inr } from '../../api/crops'
import { orderStatusMeta } from '../../api/orders'
import type { Order, OrderSummary } from '../../api/orders'
import { requestStatusMeta } from '../../api/requests'
import type { PurchaseRequest, RequestCounts } from '../../api/requests'
import StatCard from '../../components/StatCard'
import { useAuth } from '../../context/AuthContext'

interface Data {
  requests: PurchaseRequest[]
  counts: RequestCounts
  orders: Order[]
  orderCounts: { active: number; history: number }
  summary: OrderSummary
  transportActive: number
}

export default function BuyerDashboard() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [d, setD] = useState<Data | null>(null)
  const verified = user?.verificationStatus === 'verified'

  useEffect(() => {
    if (!verified) return
    Promise.all([api.get('/requests/mine'), api.get('/orders/mine'), api.get('/orders/summary'), api.get('/transport/mine')])
      .then(([rq, od, sm, tr]) => setD({ requests: rq.data.requests, counts: rq.data.counts, orders: od.data.orders, orderCounts: od.data.counts, summary: sm.data, transportActive: tr.data.counts.active }))
      .catch(() => {})
  }, [verified])

  if (!verified) return null
  if (!d) return <p className="text-slate-500">{t('Loading…')}</p>

  const needReply = d.requests.filter((r) => r.myTurn)

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t('Open requests')} value={d.counts.open} sub={needReply.length ? t('{{n}} need your reply', { n: needReply.length }) : undefined} tone={needReply.length ? 'warn' : 'default'} to="/buyer/requests" />
        <StatCard label={t('Active orders')} value={d.orderCounts.active} sub={d.transportActive ? t('{{n}} with transport requested', { n: d.transportActive }) : undefined} to="/buyer/orders" />
        <StatCard label={t('Total purchased')} value={inr(d.summary.value)} sub={t('{{n}} kg', { n: d.summary.quantity.toLocaleString('en-IN') })} to="/buyer/orders" />
        <StatCard label={t('Payment pending')} value={inr(d.summary.unpaid.value)} sub={d.summary.unpaid.orders ? t('{{n}} order(s)', { n: d.summary.unpaid.orders }) : undefined} tone={d.summary.unpaid.value ? 'warn' : 'default'} />
      </div>

      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-brand-700 to-brand-600 p-6 text-white">
        <div className="flex items-center gap-4">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-white/15"><Store size={24} /></span>
          <div>
            <h2 className="text-lg font-bold">{t('Find fresh produce')}</h2>
            <p className="text-sm text-brand-100">{t('Browse verified farmers and send a purchase request.')}</p>
          </div>
        </div>
        <Link to="/buyer/marketplace" className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-bold text-brand-800 hover:bg-brand-50">{t('Browse marketplace')} <ArrowRight size={16} /></Link>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{t('Needs your reply')}</h2>
            <Link to="/buyer/requests" className="text-xs font-semibold text-brand-700 hover:underline">{t('View all')}</Link>
          </div>
          <ul className="mt-3 divide-y divide-slate-100">
            {needReply.length === 0 && <li className="py-4 text-sm text-slate-500">{t('Nothing waiting for you.')}</li>}
            {needReply.slice(0, 3).map((r) => (
              <li key={r._id}>
                <Link to={`/buyer/requests/${r._id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-slate-50">
                  <span><span className="block font-medium">{r.crop}</span><span className="block text-xs text-slate-500">{t('{{n}} kg', { n: r.quantity.toLocaleString('en-IN') })} × {inr(r.price)} · {r.counterpart.name}</span></span>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${requestStatusMeta[r.status].cls}`}>{t(requestStatusMeta[r.status].label)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{t('Active orders')}</h2>
            <Link to="/buyer/orders" className="text-xs font-semibold text-brand-700 hover:underline">{t('View all')}</Link>
          </div>
          <ul className="mt-3 divide-y divide-slate-100">
            {d.orders.length === 0 && <li className="py-4 text-sm text-slate-500">{t('No active orders')}</li>}
            {d.orders.slice(0, 3).map((o) => (
              <li key={o._id}>
                <Link to={`/buyer/orders/${o._id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-slate-50">
                  <span><span className="block font-medium">{o.crop}</span><span className="block text-xs text-slate-500">{t('{{n}} kg', { n: o.quantity.toLocaleString('en-IN') })} · {inr(o.total)} · {o.counterpart.name}</span></span>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${orderStatusMeta[o.status].cls}`}>{t(orderStatusMeta[o.status].label)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
