import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Phone, Truck } from 'lucide-react'
import { api, errorMessage } from '../api/client'
import { fmtDate, inr } from '../api/crops'
import { requestStatusMeta } from '../api/requests'
import type { HistoryEntry, PurchaseRequest } from '../api/requests'
import { useAuth } from '../context/AuthContext'
import { dateLocale } from '../i18n'
import Stars from '../components/Stars'
import DeliveryOption, { deliveryBody, emptyDelivery, transportCost } from '../components/DeliveryOption'
import type { Delivery } from '../components/DeliveryOption'

export default function RequestDetail() {
  const { t } = useTranslation()
  const { id } = useParams()
  const { user } = useAuth()
  const role = user?.role === 'farmer' ? 'farmer' : 'buyer'

  const [r, setR] = useState<PurchaseRequest | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [countering, setCountering] = useState(false)
  const [form, setForm] = useState({ price: '', quantity: '', message: '' })
  const [delivery, setDelivery] = useState<Delivery>(emptyDelivery)

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/requests/${id}`)
      setR(data.request)
    } catch (err) {
      setError(errorMessage(err))
    }
  }, [id])

  useEffect(() => { load() }, [load])

  // Pick up the other side's reply without a manual refresh
  useEffect(() => {
    if (!r?.isOpen) return
    const timer = setInterval(load, 10000)
    return () => clearInterval(timer)
  }, [r?.isOpen, load])

  async function act(action: 'accept' | 'reject' | 'cancel' | 'counter', body?: object) {
    setError('')
    setBusy(true)
    try {
      const { data } = await api.post(`/requests/${id}/${action}`, body)
      setR(data.request)
      setCountering(false)
    } catch (err) {
      setError(errorMessage(err))
      load()
    } finally {
      setBusy(false)
    }
  }

  const back = (
    <Link to={`/${role}/requests`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft size={16} /> {t('Back to requests')}</Link>
  )
  if (!r) return <div className="space-y-4">{back}{error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : <p className="text-slate-500">{t('Loading…')}</p>}</div>

  const total = r.quantity * r.price
  const shipping = r.transportBy === 'farmer' ? r.transportCharge ?? 0 : 0
  const who = (e: HistoryEntry) => (e.by === role ? t('You') : r.counterpart.name)
  const describe = (e: HistoryEntry) => {
    const offer = t('{{q}} kg at {{p}}/kg', { q: e.quantity?.toLocaleString('en-IN'), p: inr(e.price ?? 0) })
    const ship = e.transportBy === 'farmer' ? ` + ${t('transport {{s}}', { s: inr(e.transportCharge ?? 0) })}` : e.transportBy === 'buyer' ? ` + ${t('buyer collects')}` : ''
    if (e.action === 'offer') return t('made an offer: {{offer}}', { offer: offer + ship })
    if (e.action === 'counter') return t('countered: {{offer}}', { offer: offer + ship })
    if (e.action === 'accept') return t('accepted {{offer}}', { offer })
    return e.action === 'reject' ? t('declined the request') : t('cancelled the request')
  }

  function onCounter(e: FormEvent) {
    e.preventDefault()
    const body: Record<string, unknown> = { price: form.price }
    if (form.quantity) body.quantity = form.quantity
    if (form.message.trim()) body.message = form.message.trim()
    act('counter', { ...body, ...deliveryBody(delivery) })
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {back}

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{r.crop}</h1>
            <p className="text-sm text-slate-500">
              {role === 'farmer' ? t('Buyer') : t('Farmer')}: <b className="text-slate-700">{r.counterpart.name}</b>{r.counterpart.detail ? ` · ${r.counterpart.detail}` : ''} <Stars rating={r.counterpart.rating} className="ml-1 align-middle" />
            </p>
          </div>
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${requestStatusMeta[r.status].cls}`}>{t(requestStatusMeta[r.status].label)}</span>
        </div>

        <div className="mt-5 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-3">
          <div><p className="text-xs text-slate-500">{r.status === 'accepted' ? t('Agreed quantity') : t('Current offer: quantity')}</p><p className="text-lg font-bold">{t('{{n}} kg', { n: r.quantity.toLocaleString('en-IN') })}</p></div>
          <div><p className="text-xs text-slate-500">{t('Price per kg')}</p><p className="text-lg font-bold">{inr(r.price)} <span className="text-xs font-medium text-slate-500">{t('(asking {{p}})', { p: inr(r.askingPrice) })}</span></p></div>
          <div><p className="text-xs text-slate-500">{shipping > 0 ? t('Total with transport') : t('Total value')}</p><p className="text-lg font-bold text-brand-700">{inr(total + shipping)}</p></div>
        </div>
        <p className="mt-3 flex items-center gap-2 text-sm text-slate-600"><Truck size={15} /> {r.transportBy === 'farmer' ? t('Farmer delivers: transport {{s}} ({{rate}}/km × {{km}} km) is added to the total.', { s: inr(shipping), rate: inr(r.ratePerKm ?? 0), km: r.distanceKm ?? 0 }) : t('Buyer collects / arranges transport. No transport cost for the farmer.')}</p>
        {(r.message || r.neededBy) && (
          <p className="mt-3 text-sm text-slate-600">{r.message && <>“{r.message}” </>}{r.neededBy && <span className="text-slate-500">· {t('needed by {{date}}', { date: fmtDate(r.neededBy) })}</span>}</p>
        )}
      </section>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {r.status === 'accepted' && (
        <section className="rounded-2xl border border-brand-100 bg-brand-50 p-6 text-brand-800">
          <p className="flex items-center gap-2 font-semibold"><CheckCircle2 size={20} /> {t('Deal agreed: {{q}} kg at {{p}}/kg', { q: r.finalQuantity?.toLocaleString('en-IN'), p: inr(r.finalPrice ?? 0) })}</p>
          <p className="mt-1 text-sm">{t('The stock is reserved for this order. Track delivery and payment from the order page.')}</p>
          {r.orderId && <Link to={`/${role}/orders/${r.orderId}`} className="btn-primary mt-3">{t('View order & track delivery')}</Link>}
          {r.counterpart.phone && (
            <p className="mt-3 inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-800"><Phone size={16} /> {r.counterpart.name}: {r.counterpart.phone}</p>
          )}
        </section>
      )}

      {r.isOpen && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          {r.myTurn ? (
            <>
              <h2 className="font-semibold">{t('Your reply')}</h2>
              <p className="mt-1 text-sm text-slate-500">{t('{{name}} offered {{q}} kg at {{p}}/kg ({{total}} total).', { name: r.counterpart.name, q: r.quantity.toLocaleString('en-IN'), p: inr(r.price), total: inr(total + shipping) })}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="btn-primary" disabled={busy} onClick={() => window.confirm(t('Accept {{q}} kg at {{p}}/kg ({{total}})? This reserves the stock.', { q: r.quantity, p: inr(r.price), total: inr(total + shipping) })) && act('accept')}>{t('Accept offer')}</button>
                <button className="btn-outline" disabled={busy} onClick={() => { setCountering((c) => !c); setForm({ price: String(r.price), quantity: String(r.quantity), message: '' }); setDelivery({ transportBy: r.transportBy ?? 'buyer', ratePerKm: r.ratePerKm ? String(r.ratePerKm) : '', distanceKm: r.distanceKm ? String(r.distanceKm) : '' }) }}>{t('Counter offer')}</button>
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-600">{t('Waiting for {{name}} to respond. This page refreshes automatically.', { name: r.counterpart.name })}</p>
          )}

          {countering && (
            <form onSubmit={onCounter} className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-3">
              <div><label className="mb-1 block text-xs font-medium">{t('Price (₹/kg)')}</label><input className="input" type="number" min="0.5" step="any" required value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
              <div><label className="mb-1 block text-xs font-medium">{t('Quantity (kg)')}</label><input className="input" type="number" min="1" step="any" required value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></div>
              <div><label className="mb-1 block text-xs font-medium">{t('Note (optional)')}</label><input className="input" maxLength={300} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></div>
              <div className="sm:col-span-3"><DeliveryOption value={delivery} onChange={setDelivery} quantity={Number(form.quantity) || r.quantity} /></div>
              {transportCost(delivery) > 0 && <p className="text-sm text-slate-600 sm:col-span-3">{t('Total with transport')}: <b>{inr(Number(form.quantity || r.quantity) * Number(form.price || r.price) + transportCost(delivery))}</b></p>}
              <div className="sm:col-span-3"><button className="btn-primary" disabled={busy}>{t('Send counter offer')}</button></div>
            </form>
          )}

          <div className="mt-4 border-t border-slate-100 pt-4">
            {role === 'farmer' ? (
              <button className="btn-outline text-red-600" disabled={busy} onClick={() => window.confirm(t('Decline this request?')) && act('reject')}>{t('Decline request')}</button>
            ) : (
              <button className="btn-outline text-red-600" disabled={busy} onClick={() => window.confirm(t('Cancel this request?')) && act('cancel')}>{t('Cancel request')}</button>
            )}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="font-semibold">{t('Negotiation history')}</h2>
        <ol className="mt-4 space-y-4 border-l-2 border-slate-100 pl-5">
          {r.history.map((e, i) => (
            <li key={i} className="relative">
              <span className={`absolute -left-[27px] top-1 h-3 w-3 rounded-full ${e.action === 'accept' ? 'bg-brand-500' : e.action === 'reject' || e.action === 'cancel' ? 'bg-red-400' : 'bg-slate-300'}`} />
              <p className="text-sm"><b>{who(e)}</b> {describe(e)}</p>
              {e.message && <p className="text-sm text-slate-500">“{e.message}”</p>}
              <p className="text-xs text-slate-400">{new Date(e.at).toLocaleString(dateLocale())}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
