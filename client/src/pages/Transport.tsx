import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'
import { CalendarClock, MapPin, Phone, Search, Truck } from 'lucide-react'
import { api, errorMessage } from '../api/client'
import { fmtDate, inr } from '../api/crops'
import { transportStatusMeta } from '../api/orders'
import type { Transport } from '../api/orders'
import { useAuth } from '../context/AuthContext'
import RatingBox from '../components/RatingBox'
import TransportProgress from '../components/TransportProgress'

type Tab = 'trades' | 'available' | 'active' | 'history'

interface Opportunity {
  orderId: string
  crop: string
  weightKg: number
  from: string
  arrangedBy: 'buyer' | 'farmer'
  myOffer: { _id: string; ratePerKm: number; distanceKm: number; charge: number } | null
}

// One sold order that needs a transporter: send an offer (₹ per km x km), or withdraw it
// On delivery the transporter enters the kilometres actually driven. Per-km jobs bill rate x km.
function DeliverForm({ tr, busy, onDeliver }: { tr: Transport; busy: boolean; onDeliver: (km?: number) => void }) {
  const { t } = useTranslation()
  const perKm = Boolean(tr.ratePerKm)
  const [km, setKm] = useState(tr.distanceKm ? String(tr.distanceKm) : '')
  const total = perKm ? Math.round((tr.ratePerKm ?? 0) * Number(km)) || 0 : tr.charge
  if (!perKm) return <button className="btn-primary" disabled={busy} onClick={() => onDeliver()}>{t('Mark delivered')}</button>
  return (
    <form className="flex w-full flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); onDeliver(Number(km)) }}>
      <div>
        <label className="mb-1 block text-xs font-medium">{t('Total km driven')}</label>
        <input className="input w-28" type="number" min="1" step="any" required value={km} onChange={(e) => setKm(e.target.value)} />
      </div>
      <p className="pb-2 text-sm text-slate-600">{inr(tr.ratePerKm ?? 0)}/km × {km || 0} km = <b className="text-brand-700">{inr(total)}</b></p>
      <button className="btn-primary" disabled={busy || !(Number(km) > 0)}>{t('Mark delivered')}</button>
      {tr.distanceKm ? <p className="w-full text-xs text-slate-500">{t('Agreed distance was {{n}} km. You can enter up to 30% more.', { n: tr.distanceKm })}</p> : null}
    </form>
  )
}

function OpportunityCard({ o, onChanged }: { o: Opportunity; onChanged: () => void }) {
  const { t } = useTranslation()
  const [f, setF] = useState({ ratePerKm: '', distanceKm: '', message: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const total = Math.round(Number(f.ratePerKm) * Number(f.distanceKm)) || 0

  async function run(fn: () => Promise<unknown>) {
    setErr('')
    setBusy(true)
    try {
      await fn()
      onChanged()
    } catch (e) {
      setErr(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="text-lg font-bold">{o.crop} · {t('{{n}} kg', { n: o.weightKg.toLocaleString('en-IN') })}</h3>
      <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500"><MapPin size={15} />{t('Pickup area')}: {o.from || '—'}</p>
      <p className="text-xs text-slate-500">{o.arrangedBy === 'farmer' ? t('The farmer arranges transport (cost is in the order).') : t('The buyer arranges transport.')}</p>
      {o.myOffer ? (
        <div className="mt-3 rounded-lg bg-brand-50 p-3 text-sm text-brand-800">
          <p>{t('Your offer')}: <b>{inr(o.myOffer.charge)}</b> ({inr(o.myOffer.ratePerKm)}/km × {o.myOffer.distanceKm} km)</p>
          <button className="btn-outline mt-2" disabled={busy} onClick={() => run(() => api.post(`/transport/offers/${o.myOffer!._id}/withdraw`))}>{t('Withdraw offer')}</button>
        </div>
      ) : (
        <form className="mt-3 grid grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); run(() => api.post(`/transport/orders/${o.orderId}/offers`, { ratePerKm: f.ratePerKm, distanceKm: f.distanceKm, ...(f.message.trim() && { message: f.message.trim() }) })) }}>
          <div><label className="mb-1 block text-xs font-medium">{t('Cost per km (₹)')}</label><input className="input" type="number" min="1" step="any" required value={f.ratePerKm} onChange={(e) => setF({ ...f, ratePerKm: e.target.value })} /></div>
          <div><label className="mb-1 block text-xs font-medium">{t('Distance (km)')}</label><input className="input" type="number" min="1" step="any" required value={f.distanceKm} onChange={(e) => setF({ ...f, distanceKm: e.target.value })} /></div>
          <div className="col-span-2"><input className="input" maxLength={300} placeholder={t('Message (optional)')} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} /></div>
          {total > 0 && <p className="col-span-2 text-sm text-slate-600">{t('Your total for {{n}} kg', { n: o.weightKg.toLocaleString('en-IN') })}: <b>{inr(total)}</b></p>}
          <div className="col-span-2"><button className="btn-primary" disabled={busy}>{t('Send offer')}</button></div>
        </form>
      )}
      {err && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
    </li>
  )
}

// Farmer: their transport requests (Active / History). Transporter: Available jobs, My trips, History + earnings.
export default function TransportPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const isTransporter = user?.role === 'transporter'
  const [params] = useSearchParams()
  const wanted = params.get('tab')
  const [tab, setTab] = useState<Tab>(!isTransporter ? 'active' : wanted === 'trades' ? 'trades' : wanted === 'mine' ? 'active' : 'available')
  const [trades, setTrades] = useState<Opportunity[]>([])
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<'new' | 'pay'>('new')
  const [items, setItems] = useState<Transport[]>([])
  const [counts, setCounts] = useState({ active: 0, history: 0 })
  const [summary, setSummary] = useState<{ trips: number; amount: number; received?: number; pending?: number; kg: number; rating?: { avg: number; count: number } | null }>({ trips: 0, amount: 0, kg: 0 })
  const [capacity, setCapacity] = useState<number>()
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      if (tab === 'trades') {
        const { data } = await api.get('/transport/opportunities')
        setTrades(data.orders)
        setCapacity(data.capacityKg)
      } else if (tab === 'available') {
        const { data } = await api.get('/transport/available', { params: { sort, ...(q.trim() && { q: q.trim() }) } })
        setItems(data.transports)
        setCapacity(data.capacityKg)
      } else {
        const { data } = await api.get('/transport/mine', { params: { tab } })
        setItems(data.transports)
        setCounts(data.counts)
        setSummary(data.summary)
      }
      if (tab === 'available' || tab === 'trades') {
        const { data } = await api.get('/transport/mine')
        setCounts(data.counts)
        setSummary(data.summary)
      }
      setError('')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [tab, q, sort])

  useEffect(() => {
    setLoading(true)
    const timer = setTimeout(load, tab === 'available' ? 300 : 0)
    return () => clearTimeout(timer)
  }, [load, tab])

  async function act(tr: Transport, run: () => Promise<unknown>) {
    setError('')
    setBusyId(tr._id)
    try {
      await run()
      await load()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusyId('')
    }
  }

  const tabs: [Tab, string][] = isTransporter
    ? [['trades', t('Trades needing transport')], ['available', t('Available jobs')], ['active', t('My trips ({{n}})', { n: counts.active })], ['history', t('History ({{n}})', { n: counts.history })]]
    : [['active', t('Active ({{n}})', { n: counts.active })], ['history', t('History ({{n}})', { n: counts.history })]]

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">{t('Transport Requests')}</h1>
        <p className="text-sm text-slate-500">{isTransporter ? t('Find jobs that fit your vehicle and manage your trips.') : t('Transport requested for your orders, by you or the other party.')}</p>
      </div>

      {isTransporter && (
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {[[t('Trips delivered'), String(summary.trips)], [t('Total earned'), inr(summary.amount)], [t('Payment received'), inr(summary.received ?? 0)], [t('Payment pending'), inr(summary.pending ?? 0)], [t('Goods moved'), t('{{n}} kg', { n: summary.kg.toLocaleString('en-IN') })]].map(([k, v]) => (
            <div key={k} className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-2xl font-bold text-brand-700">{v}</p><p className="mt-1 text-sm text-slate-500">{k}</p></div>
          ))}
          <div className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-2xl font-bold text-brand-700">{summary.rating ? `★ ${summary.rating.avg}` : '—'}</p><p className="mt-1 text-sm text-slate-500">{t('Your rating')} {summary.rating ? `(${summary.rating.count})` : ''}</p></div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {tabs.map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)} className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${tab === v ? 'bg-brand-600 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>{l}</button>
        ))}
      </div>

      {tab === 'available' && (
        <div>
          <div className="relative max-w-md">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input py-2.5 pl-10" placeholder={t('Search by place, e.g. Anantapur')} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className="input mt-2 w-auto py-2" value={sort} onChange={(e) => setSort(e.target.value as 'new' | 'pay')}>
            <option value="new">{t('Newest first')}</option>
            <option value="pay">{t('Highest pay first')}</option>
          </select>
          {capacity !== undefined && <p className="mt-2 text-xs text-slate-500">{t('Showing jobs up to your vehicle capacity ({{n}} kg).', { n: capacity.toLocaleString('en-IN') })}</p>}
        </div>
      )}

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {tab === 'trades' ? (
        loading ? <p className="text-slate-500">{t('Loading…')}</p> : trades.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <Truck className="mx-auto text-slate-400" size={32} />
            <p className="mt-2 font-semibold">{t('No sold orders need a transporter right now')}</p>
            <p className="text-sm text-slate-500">{t('You get a notification as soon as a farmer and buyer close a deal that fits your vehicle.')}</p>
          </div>
        ) : (
          <>
            {capacity !== undefined && <p className="text-xs text-slate-500">{t('Showing jobs up to your vehicle capacity ({{n}} kg).', { n: capacity.toLocaleString('en-IN') })}</p>}
            <ul className="grid gap-4 lg:grid-cols-2">{trades.map((o) => <OpportunityCard key={o.orderId} o={o} onChanged={load} />)}</ul>
          </>
        )
      ) : loading ? (
        <p className="text-slate-500">{t('Loading…')}</p>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <Truck className="mx-auto text-slate-400" size={32} />
          <p className="mt-2 font-semibold">{tab === 'available' ? t('No open jobs right now') : tab === 'active' ? t('Nothing active') : t('No transport history yet')}</p>
          {!isTransporter && tab === 'active' && <p className="text-sm text-slate-500">{t('Open an order and choose “Request transport”.')}</p>}
        </div>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {items.map((tr) => (
            <li key={tr._id} className="flex flex-col rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-lg font-bold">{tr.crop} · {t('{{n}} kg', { n: tr.weightKg.toLocaleString('en-IN') })}</h3>
                  <p className="text-sm text-slate-500">{isTransporter ? t('Requested by {{name}}', { name: tr.counterpart?.name ?? '' }) : tr.requestedBy === user?.role ? t('Requested by you') : t('Requested by the {{who}}', { who: t(tr.requestedBy ?? 'farmer') })}</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-extrabold text-brand-700">{inr(tr.finalCharge ?? tr.charge)}</p>
                  {tr.finalCharge != null && tr.ratePerKm && tr.actualKm ? <p className="text-xs text-slate-500">{inr(tr.ratePerKm)}/km × {tr.actualKm} km {t('(final)')}</p> : tr.ratePerKm && tr.distanceKm ? <p className="text-xs text-slate-500">{inr(tr.ratePerKm)}/km × {tr.distanceKm} km {t('(agreed)')}</p> : null}
                  {tr.finalCharge != null && tr.finalCharge !== tr.charge && <p className="text-[11px] text-slate-400">{t('Agreed {{n}}', { n: inr(tr.charge) })}</p>}
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${transportStatusMeta[tr.status].cls}`}>{t(transportStatusMeta[tr.status].label)}</span>
                </div>
              </div>

              <ul className="mt-3 space-y-1 text-sm text-slate-600">
                <li className="flex items-start gap-1.5"><MapPin size={15} className="mt-0.5 shrink-0 text-slate-400" />{tr.pickupAddress} → {tr.dropAddress}</li>
                <li className="flex items-center gap-1.5"><CalendarClock size={15} className="text-slate-400" />{t('Pickup {{date}}', { date: fmtDate(tr.pickupDate) })}</li>
                {tr.notes && <li className="text-slate-500">“{tr.notes}”</li>}
              </ul>

              {['accepted', 'picked_up', 'delivered'].includes(tr.status) && <TransportProgress status={tr.status} timeline={tr.timeline} paymentStatus={tr.paymentStatus} paidAt={tr.paidAt} />}

              {isTransporter && tr.contacts && (
                <div className="mt-3 space-y-1 rounded-lg bg-slate-50 p-3 text-sm">
                  <p className="flex flex-wrap items-center gap-x-2"><b>{t('Pickup contact')}:</b> {tr.contacts.farmer.name} {tr.contacts.farmer.phone && <span className="inline-flex items-center gap-1"><Phone size={14} />{tr.contacts.farmer.phone}</span>}</p>
                  <p className="flex flex-wrap items-center gap-x-2"><b>{t('Delivery contact')}:</b> {tr.contacts.buyer.name} {tr.contacts.buyer.phone && <span className="inline-flex items-center gap-1"><Phone size={14} />{tr.contacts.buyer.phone}</span>}</p>
                </div>
              )}
              {!isTransporter && tr.counterpart && (tr.counterpart.phone || tr.counterpart.vehicle) && (
                <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-slate-50 p-3 text-sm">
                  <b>{tr.counterpart.name}</b>
                  {tr.counterpart.vehicle && <span className="text-slate-600">{tr.counterpart.vehicle}</span>}
                  {tr.counterpart.phone && <span className="inline-flex items-center gap-1"><Phone size={14} />{tr.counterpart.phone}</span>}
                </p>
              )}

              {isTransporter && tr.status === 'delivered' && tr.orderId && <div className="mt-3"><RatingBox orderId={tr.orderId} /></div>}
              <div className="mt-4 flex flex-1 flex-wrap items-end gap-2 border-t border-slate-100 pt-4">
                {isTransporter && tr.status === 'open' && <button className="btn-primary" disabled={busyId === tr._id} onClick={() => act(tr, () => api.post(`/transport/${tr._id}/accept`))}>{t('Accept job')}</button>}
                {isTransporter && tr.status === 'accepted' && (
                  <>
                    <button className="btn-primary" disabled={busyId === tr._id} onClick={() => act(tr, () => api.patch(`/transport/${tr._id}/status`, { status: 'picked_up' }))}>{t('Mark picked up')}</button>
                    <button className="btn-outline" disabled={busyId === tr._id} onClick={() => window.confirm(t('Release this job back to the open list?')) && act(tr, () => api.post(`/transport/${tr._id}/release`))}>{t('Release job')}</button>
                  </>
                )}
                {isTransporter && tr.status === 'picked_up' && <DeliverForm tr={tr} busy={busyId === tr._id} onDeliver={(km) => act(tr, () => api.patch(`/transport/${tr._id}/status`, { status: 'delivered', ...(km && { actualKm: km }) }))} />}
                {isTransporter && tr.status === 'delivered' && tr.paymentStatus !== 'paid' && <button className="btn-primary" disabled={busyId === tr._id} onClick={() => window.confirm(t('Confirm you received {{n}} for this trip?', { n: inr(tr.finalCharge ?? tr.charge) })) && act(tr, () => api.post(`/transport/${tr._id}/paid`))}>{t('Mark payment received')}</button>}
                {!isTransporter && tr.requestedBy === user?.role && ['open', 'accepted'].includes(tr.status) && <button className="btn-outline text-red-600" disabled={busyId === tr._id} onClick={() => window.confirm(t('Cancel this transport request?')) && act(tr, () => api.post(`/transport/${tr._id}/cancel`))}>{t('Cancel')}</button>}
                {!isTransporter && tr.orderId && <Link to={`/${user?.role}/orders/${tr.orderId}`} className="btn-outline">{t('View order')}</Link>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
