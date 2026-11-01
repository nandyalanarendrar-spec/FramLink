import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Check, Phone, Star, Truck } from 'lucide-react'
import { api, errorMessage } from '../api/client'
import { fmtDate, inr } from '../api/crops'
import { orderStatusMeta, orderSteps, transportStatusMeta } from '../api/orders'
import type { Order } from '../api/orders'
import { transportCost } from '../components/DeliveryOption'
import { useAuth } from '../context/AuthContext'
import ReportButton from '../components/ReportButton'
import RatingBox from '../components/RatingBox'
import Stars from '../components/Stars'
import TransportProgress from '../components/TransportProgress'
import { T, dateLocale } from '../i18n'

interface TransportOffer {
  _id: string
  ratePerKm: number
  distanceKm: number
  charge: number
  message?: string
  transporter: { name: string; vehicle: string; capacityKg?: number; rating?: { avg: number; count: number } | null }
}

const nextFarmerStep = {
  confirmed: ['ready_for_pickup', T('Mark ready for pickup')],
  ready_for_pickup: ['in_transit', T('Mark in transit (self delivery)')],
  in_transit: ['delivered', T('Mark delivered (self delivery)')],
} as const

export default function OrderDetail() {
  const { t } = useTranslation()
  const { id } = useParams()
  const { user } = useAuth()
  const role = user?.role === 'farmer' ? 'farmer' : 'buyer'

  const [o, setO] = useState<Order | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [stars, setStars] = useState(0)
  const [comment, setComment] = useState('')
  const [tf, setTf] = useState({ pickupAddress: '', dropAddress: '', pickupDate: '', ratePerKm: '', distanceKm: '', notes: '' })
  const [offers, setOffers] = useState<TransportOffer[]>([])

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/orders/${id}`)
      setO(data.order)
      setTf((f) => ({
        ...f,
        pickupAddress: f.pickupAddress || (data.order.pickupFrom ? `${data.order.pickupFrom.village}, ${data.order.pickupFrom.district}` : ''),
        dropAddress: f.dropAddress || data.order.dropTo || '',
      }))
    } catch (err) {
      setError(errorMessage(err))
    }
  }, [id])

  useEffect(() => { load() }, [load])

  // Offers from transporters, for the side that arranges transport while nobody is booked yet
  const needsTransport = !!o && ['confirmed', 'ready_for_pickup'].includes(o.status) && !(o.transport && ['open', 'accepted', 'picked_up'].includes(o.transport.status))
  const canBook = !!o && (!o.transportBy || o.transportBy === role)
  useEffect(() => {
    if (!needsTransport || !canBook || !o) return setOffers([])
    api.get(`/transport/orders/${o._id}/offers`).then((r) => setOffers(r.data.offers)).catch(() => setOffers([]))
  }, [o, needsTransport, canBook])
  useEffect(() => {
    if (!o || ['completed', 'cancelled'].includes(o.status)) return
    const timer = setInterval(load, 10000)
    return () => clearInterval(timer)
  }, [o, load])

  async function run(fn: () => Promise<unknown>) {
    setError('')
    setBusy(true)
    try {
      await fn()
      await load()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const back = <Link to={`/${role}/orders`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft size={16} /> {t('Back to orders')}</Link>
  if (!o) return <div className="space-y-4">{back}{error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : <p className="text-slate-500">{t('Loading…')}</p>}</div>

  const tr = o.transport && ['open', 'accepted', 'picked_up'].includes(o.transport.status) ? o.transport : null
  const transporterBusy = tr && tr.status !== 'open'
  const cancellable = ['confirmed', 'ready_for_pickup'].includes(o.status)
  const stepIdx = orderSteps.indexOf(o.status)
  const farmerNext = role === 'farmer' && o.status in nextFarmerStep ? nextFarmerStep[o.status as keyof typeof nextFarmerStep] : null

  function submitTransport(e: FormEvent) {
    e.preventDefault()
    const body: Record<string, unknown> = { orderId: o!._id, pickupAddress: tf.pickupAddress, dropAddress: tf.dropAddress, pickupDate: tf.pickupDate, ratePerKm: tf.ratePerKm, distanceKm: tf.distanceKm }
    if (tf.notes.trim()) body.notes = tf.notes.trim()
    run(() => api.post('/transport', body))
  }
  const bookCost = transportCost({ transportBy: 'farmer', ratePerKm: tf.ratePerKm, distanceKm: tf.distanceKm })
  const grand = o.grandTotal ?? o.total + (o.transportCharge ?? 0)

  function chooseOffer(offerId: string) {
    if (tf.pickupAddress.trim().length < 5 || tf.dropAddress.trim().length < 5 || !tf.pickupDate) {
      setError(t('Fill in the pickup address, delivery address and pickup date below, then choose an offer.'))
      return
    }
    const body: Record<string, unknown> = { pickupAddress: tf.pickupAddress, dropAddress: tf.dropAddress, pickupDate: tf.pickupDate }
    if (tf.notes.trim()) body.notes = tf.notes.trim()
    run(() => api.post(`/transport/offers/${offerId}/accept`, body))
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {back}

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{o.crop}</h1>
            <p className="text-sm text-slate-500">{role === 'farmer' ? t('Buyer') : t('Farmer')}: <b className="text-slate-700">{o.counterpart.name}</b>{o.counterpart.detail ? ` · ${o.counterpart.detail}` : ''} <Stars rating={o.counterpart.rating} className="ml-1 align-middle" /></p>
          </div>
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${orderStatusMeta[o.status].cls}`}>{t(orderStatusMeta[o.status].label)}</span>
        </div>

        <div className="mt-5 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-4">
          <div><p className="text-xs text-slate-500">{t('Quantity')}</p><p className="font-bold">{t('{{n}} kg', { n: o.quantity.toLocaleString('en-IN') })}</p></div>
          <div><p className="text-xs text-slate-500">{t('Price per kg')}</p><p className="font-bold">{inr(o.price)}</p></div>
          <div><p className="text-xs text-slate-500">{o.transportCharge ? t('Total with transport') : t('Total')}</p><p className="font-bold text-brand-700">{inr(grand)}</p>{!!o.transportCharge && <p className="text-[11px] text-slate-500">{t('crop {{c}} + transport {{s}}', { c: inr(o.total), s: inr(o.transportCharge) })}</p>}</div>
          <div><p className="text-xs text-slate-500">{t('Payment')}</p><p className={`font-bold ${o.paymentStatus === 'paid' ? 'text-brand-700' : 'text-amber-600'}`}>{o.paymentStatus === 'paid' ? t('Paid {{date}}', { date: fmtDate(o.paidAt) }) : t('Pending')}</p></div>
        </div>
        <p className="mt-3 inline-flex items-center gap-2 text-sm text-slate-600"><Phone size={15} /> {o.counterpart.name}: <b>{o.counterpart.phone}</b></p>

        {o.status !== 'cancelled' && (
          <ol className="mt-6 flex items-center">
            {orderSteps.map((s, i) => (
              <li key={s} className="flex flex-1 items-center last:flex-none">
                <div className="flex flex-col items-center gap-1">
                  <span className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${i <= stepIdx ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-500'}`}>{i < stepIdx ? <Check size={14} /> : i + 1}</span>
                  <span className="w-16 text-center text-[11px] leading-tight text-slate-500">{t(orderStatusMeta[s].label)}</span>
                </div>
                {i < orderSteps.length - 1 && <span className={`mx-1 mb-5 h-0.5 flex-1 ${i < stepIdx ? 'bg-brand-600' : 'bg-slate-200'}`} />}
              </li>
            ))}
          </ol>
        )}
        {o.status === 'cancelled' && (
          <p className="mt-4 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">
            {t('Cancelled by the {{who}}.', { who: t(o.cancelledBy === 'farmer' ? 'farmer' : 'buyer') })}{o.cancelReason ? ` “${o.cancelReason}”` : ''} {t('The stock went back on the listing.')}
          </p>
        )}
      </section>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {/* Farmer: move the order forward and record payment */}
      {role === 'farmer' && o.status !== 'cancelled' && o.status !== 'completed' && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="font-semibold">{t('Update order')}</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {farmerNext && (o.status === 'confirmed' || !transporterBusy) && (
              <button className="btn-primary" disabled={busy} onClick={() => run(() => api.patch(`/orders/${o._id}/status`, { status: farmerNext[0] }))}>{t(farmerNext[1])}</button>
            )}
            {transporterBusy && o.status !== 'confirmed' && <p className="text-sm text-slate-600">{t('The assigned transporter marks pickup and delivery.')}</p>}
            {o.status === 'delivered' && <p className="text-sm text-slate-600">{t('Waiting for the buyer to confirm receipt.')}</p>}
            {o.paymentStatus === 'pending' && (
              <button className="btn-outline" disabled={busy} onClick={() => window.confirm(t('Confirm you have received payment for this order?')) && run(() => api.post(`/orders/${o._id}/paid`))}>{t('Mark payment received')}</button>
            )}
          </div>
        </section>
      )}

      {/* Buyer: confirm receipt + rate */}
      {role === 'buyer' && o.status === 'delivered' && (
        <section className="rounded-2xl border border-brand-100 bg-brand-50 p-6">
          <h2 className="font-semibold text-brand-800">{t('Received your order?')}</h2>
          <p className="text-sm text-brand-800/80">{t('Confirm receipt and rate {{name}}.', { name: o.counterpart.name })}</p>
          <div className="mt-3 flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" onClick={() => setStars(n)} aria-label={t('{{n}} stars', { n })}><Star size={26} className={n <= stars ? 'fill-amber-400 text-amber-400' : 'text-slate-300'} /></button>
            ))}
          </div>
          <input className="input mt-3 bg-white" maxLength={300} placeholder={t('Comment (optional)')} value={comment} onChange={(e) => setComment(e.target.value)} />
          <button className="btn-primary mt-3" disabled={busy} onClick={() => run(() => api.post(`/orders/${o._id}/complete`, { ...(stars && { stars }), ...(comment.trim() && { comment: comment.trim() }) }))}>{t('Confirm receipt')}</button>
        </section>
      )}
      {o.rating && (
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm"><span className="inline-flex items-center gap-1 font-semibold">{role === 'buyer' ? t('Your rating') : t('Buyer rating')}: {o.rating.stars} <Star size={14} className="fill-amber-400 text-amber-400" /></span>{o.rating.comment && <span className="text-slate-600"> · “{o.rating.comment}”</span>}</p>
      )}

      <RatingBox orderId={o._id} />

      {/* Transport */}
      {(tr || cancellable) && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="flex items-center gap-2 font-semibold"><Truck size={18} /> {t('Transport')}</h2>
          {tr ? (
            <div className="mt-3 space-y-2 text-sm">
              <p><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${transportStatusMeta[tr.status].cls}`}>{t(transportStatusMeta[tr.status].label)}</span> <span className="ml-2 text-slate-600">{inr(tr.charge)}{tr.ratePerKm && tr.distanceKm ? ` (${inr(tr.ratePerKm)}/km × ${tr.distanceKm} km)` : ''} · {t('pickup {{date}}', { date: fmtDate(tr.pickupDate) })}</span></p>
              {['accepted', 'picked_up'].includes(tr.status) && <TransportProgress status={tr.status} timeline={tr.timeline} />}
              <p className="text-xs text-slate-500">{tr.requester === user?.id ? t('Requested by you') : t('Requested by the {{who}}', { who: t(tr.requesterRole ?? 'farmer') })}</p>
              <p className="text-slate-600">{tr.pickupAddress} → {tr.dropAddress}</p>
              {tr.transporter ? (
                <p className="rounded-lg bg-slate-50 p-3">{t('Transporter')}: <b>{tr.transporter.name}</b> · {tr.transporter.vehicleType} {tr.transporter.vehicleNumber} · {tr.transporter.phone}</p>
              ) : <p className="text-slate-500">{t('Waiting for a transporter to accept.')}</p>}
              {tr.requester === user?.id && tr.status !== 'picked_up' && (
                <button className="btn-outline text-red-600" disabled={busy} onClick={() => window.confirm(t('Cancel this transport request?')) && run(() => api.post(`/transport/${tr._id}/cancel`))}>{t('Cancel transport')}</button>
              )}
            </div>
          ) : !canBook ? (
            <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
              {o.transportBy === 'farmer'
                ? role === 'buyer' ? t('The farmer delivers this order. The transport cost is already in your total.') : ''
                : t('The buyer collects this order and arranges transport.')}
            </p>
          ) : (
            <div className="mt-3 space-y-4">
              {o.transportBy === 'farmer' && role === 'farmer' && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{t('You agreed to deliver this order. The buyer already pays {{s}} for transport.', { s: inr(o.transportCharge ?? 0) })}</p>}
              {offers.length > 0 && (
                <div>
                  <p className="text-sm font-semibold">{t('Offers from transporters ({{n}})', { n: offers.length })}</p>
                  <ul className="mt-2 space-y-2">
                    {offers.map((f) => (
                      <li key={f._id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 text-sm">
                        <div>
                          <p className="font-semibold">{f.transporter.name} <Stars rating={f.transporter.rating} className="mr-1" /> <span className="font-normal text-slate-500">· {f.transporter.vehicle}{f.transporter.capacityKg ? ` · ${t('{{n}} kg', { n: f.transporter.capacityKg.toLocaleString('en-IN') })}` : ''}</span></p>
                          <p className="text-slate-600">{inr(f.ratePerKm)}/km × {f.distanceKm} km = <b className="text-brand-700">{inr(f.charge)}</b></p>
                          {f.message && <p className="text-slate-500">“{f.message}”</p>}
                        </div>
                        <button type="button" className="btn-primary" disabled={busy} onClick={() => chooseOffer(f._id)}>{t('Choose this transporter')}</button>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-slate-500">{t('Fill in the pickup address, delivery address and date below, then choose an offer.')}</p>
                </div>
              )}
              <form onSubmit={submitTransport} className="grid gap-3 sm:grid-cols-2">
                <p className="text-sm text-slate-500 sm:col-span-2">{t('Need a vehicle for {{n}} kg? Verified transporters whose vehicle fits will see this job. Or wait for offers above.', { n: o.quantity.toLocaleString('en-IN') })}</p>
                <div><label className="mb-1 block text-xs font-medium">{t('Pickup address')}</label><input className="input" required minLength={5} value={tf.pickupAddress} onChange={(e) => setTf({ ...tf, pickupAddress: e.target.value })} /></div>
                <div><label className="mb-1 block text-xs font-medium">{t('Delivery address')}</label><input className="input" required minLength={5} placeholder={t("Buyer's shop / market")} value={tf.dropAddress} onChange={(e) => setTf({ ...tf, dropAddress: e.target.value })} /></div>
                <div><label className="mb-1 block text-xs font-medium">{t('Pickup date')}</label><input className="input" type="date" required min={new Date().toISOString().slice(0, 10)} value={tf.pickupDate} onChange={(e) => setTf({ ...tf, pickupDate: e.target.value })} /></div>
                <div><label className="mb-1 block text-xs font-medium">{t('Notes (optional)')}</label><input className="input" maxLength={300} value={tf.notes} onChange={(e) => setTf({ ...tf, notes: e.target.value })} /></div>
                <div><label className="mb-1 block text-xs font-medium">{t('Cost per km (₹)')}</label><input className="input" type="number" min="1" step="any" required value={tf.ratePerKm} onChange={(e) => setTf({ ...tf, ratePerKm: e.target.value })} /></div>
                <div><label className="mb-1 block text-xs font-medium">{t('Distance (km)')}</label><input className="input" type="number" min="1" step="any" required value={tf.distanceKm} onChange={(e) => setTf({ ...tf, distanceKm: e.target.value })} /></div>
                {bookCost > 0 && <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800 sm:col-span-2">{t('Transport cost for {{n}} kg', { n: o.quantity.toLocaleString('en-IN') })}: <b>{inr(bookCost)}</b> ({inr(Number(tf.ratePerKm))}/km × {tf.distanceKm} km)</p>}
                <div className="sm:col-span-2"><button className="btn-primary" disabled={busy}>{t('Request transport')}</button></div>
              </form>
            </div>
          )}
        </section>
      )}

      {o.transport?.status === 'delivered' && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="flex items-center gap-2 font-semibold"><Truck size={18} /> {t('Transport trip')}</h2>
          <TransportProgress status={o.transport.status} timeline={o.transport.timeline} paymentStatus={o.transport.paymentStatus} paidAt={o.transport.paidAt} />
          <p className="mt-4 text-sm text-slate-700">
            {t('Final transport cost')}: <b className="text-brand-700">{inr(o.transport.finalCharge ?? o.transport.charge)}</b>
            {o.transport.ratePerKm && o.transport.actualKm ? <span className="text-slate-500"> ({inr(o.transport.ratePerKm)}/km × {o.transport.actualKm} km)</span> : null}
            {o.transport.finalCharge != null && o.transport.finalCharge !== o.transport.charge && <span className="text-slate-400"> · {t('Agreed {{n}}', { n: inr(o.transport.charge) })}</span>}
          </p>
          {o.transport.transporter && <p className="mt-1 text-sm text-slate-600">{t('Transporter')}: <b>{o.transport.transporter.name}</b> · {o.transport.transporter.phone}</p>}
          <p className={`mt-2 text-sm font-semibold ${o.transport.paymentStatus === 'paid' ? 'text-brand-700' : 'text-amber-700'}`}>{o.transport.paymentStatus === 'paid' ? t('The transporter confirmed payment received.') : t('Pay the transporter directly. They will mark it received.')}</p>
        </section>
      )}

      {cancellable && (
        <div className="text-right">
          <button className="btn-outline text-red-600" disabled={busy} onClick={() => { const reason = window.prompt(t('Reason for cancelling (optional)')); if (reason !== null) run(() => api.post(`/orders/${o._id}/cancel`, reason.trim() ? { reason: reason.trim() } : {})) }}>{t('Cancel order')}</button>
        </div>
      )}

      <ReportButton targetType="order" targetId={o._id} />

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="font-semibold">{t('Order timeline')}</h2>
        <ol className="mt-4 space-y-3 border-l-2 border-slate-100 pl-5">
          {o.timeline.map((e, i) => (
            <li key={i} className="relative">
              <span className={`absolute -left-[27px] top-1 h-3 w-3 rounded-full ${e.status === 'cancelled' ? 'bg-red-400' : 'bg-brand-500'}`} />
              <p className="text-sm font-medium">{t(orderStatusMeta[e.status].label)}{e.by !== 'system' && <span className="font-normal text-slate-500"> · {t('by {{who}}', { who: e.by === role ? t('you') : t(e.by) })}</span>}</p>
              {e.note && <p className="text-sm text-slate-500">“{e.note}”</p>}
              <p className="text-xs text-slate-400">{new Date(e.at).toLocaleString(dateLocale())}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
