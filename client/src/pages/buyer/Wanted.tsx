import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { CalendarClock, MapPin, Megaphone, Plus, Truck } from 'lucide-react'
import { api, errorMessage } from '../../api/client'
import { fmtDate, inr } from '../../api/crops'
import type { Demand, DemandOfferView } from '../../api/demands'
import Stars from '../../components/Stars'
import VoiceFill from '../../components/VoiceFill'

const empty = { crop: '', quantity: '', maxPrice: '', neededBy: '', deliverTo: '', notes: '' }
const statusCls = { open: 'bg-blue-100 text-blue-700', filled: 'bg-brand-100 text-brand-700', closed: 'bg-slate-200 text-slate-600' } as const

// Buyer: tell every farmer what you need and the most you will pay, then pick from the offers
export default function Wanted() {
  const { t } = useTranslation()
  const [demands, setDemands] = useState<Demand[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(empty)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [offers, setOffers] = useState<DemandOfferView[]>([])

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/demands/mine')
      setDemands(data.demands)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { load() }, [load])

  const loadOffers = useCallback(async (id: string) => {
    const { data } = await api.get(`/demands/${id}`)
    setOffers(data.offers)
  }, [])
  useEffect(() => {
    if (!openId) return
    loadOffers(openId).catch((err) => setError(errorMessage(err)))
  }, [openId, loadOffers])

  async function post(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await api.post('/demands', { ...form, ...(form.notes.trim() ? {} : { notes: undefined }) })
      setForm(empty)
      setShowForm(false)
      await load()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function act(fn: () => Promise<unknown>) {
    setError('')
    setBusy(true)
    try {
      await fn()
      await load()
      if (openId) await loadOffers(openId)
    } catch (err) {
      setError(errorMessage(err))
      if (openId) loadOffers(openId).catch(() => {})
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('Wanted Crops')}</h1>
          <p className="text-sm text-slate-500">{t('Tell all farmers what you need and the most you will pay. Farmers send offers, you choose one.')}</p>
        </div>
        <button className="btn-primary gap-2" onClick={() => setShowForm((s) => !s)}><Plus size={18} /> {t('Post a request')}</button>
      </div>

      {showForm && (
        <>
          <VoiceFill onResult={(v) => setForm((f) => ({ ...f, ...(v.crop && { crop: v.crop }), ...(v.quantity && { quantity: String(v.quantity) }), ...(v.price && { maxPrice: String(v.price) }) }))} />
          <form onSubmit={post} className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-6 sm:grid-cols-2">
            <div><label className="mb-1 block text-sm font-medium">{t('Crop wanted')}</label><input className="input" required minLength={2} maxLength={60} placeholder="Tomato" value={form.crop} onChange={(e) => setForm({ ...form, crop: e.target.value })} /></div>
            <div><label className="mb-1 block text-sm font-medium">{t('Quantity needed (kg)')}</label><input className="input" type="number" min="1" step="any" required value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></div>
            <div><label className="mb-1 block text-sm font-medium">{t('Most you will pay (₹ per kg)')}</label><input className="input" type="number" min="0.5" step="any" required value={form.maxPrice} onChange={(e) => setForm({ ...form, maxPrice: e.target.value })} /></div>
            <div><label className="mb-1 block text-sm font-medium">{t('Needed by')}</label><input className="input" type="date" required min={new Date().toISOString().slice(0, 10)} value={form.neededBy} onChange={(e) => setForm({ ...form, neededBy: e.target.value })} /></div>
            <div className="sm:col-span-2"><label className="mb-1 block text-sm font-medium">{t('Deliver to')}</label><input className="input" required minLength={3} maxLength={120} placeholder={t('Town, district or market')} value={form.deliverTo} onChange={(e) => setForm({ ...form, deliverTo: e.target.value })} /></div>
            <div className="sm:col-span-2"><label className="mb-1 block text-sm font-medium">{t('Notes (optional)')}</label><input className="input" maxLength={300} placeholder={t('Grade, packing, anything farmers should know')} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            <div className="flex gap-2 sm:col-span-2"><button className="btn-primary" disabled={busy}>{busy ? t('Posting…') : t('Post request')}</button><button type="button" className="btn-outline" onClick={() => setShowForm(false)}>{t('Cancel')}</button></div>
          </form>
        </>
      )}

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {loading ? (
        <p className="text-slate-500">{t('Loading…')}</p>
      ) : demands.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <Megaphone className="mx-auto text-slate-400" size={32} />
          <p className="mt-2 font-semibold">{t('No requests yet')}</p>
          <p className="text-sm text-slate-500">{t('Post what you need and farmers who have it will answer.')}</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {demands.map((d) => {
            const status = d.expired ? 'closed' : d.status
            const pct = Math.round((d.filledQty / d.quantity) * 100)
            return (
              <li key={d._id} className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold">{d.crop} · {t('{{n}} kg', { n: d.quantity.toLocaleString('en-IN') })}</h3>
                    <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
                      <span className="font-semibold text-brand-700">{t('Up to {{p}}/kg', { p: inr(d.maxPrice) })}</span>
                      <span className="inline-flex items-center gap-1"><CalendarClock size={14} className="text-slate-400" />{t('Needed by {{date}}', { date: fmtDate(d.neededBy) })}</span>
                      <span className="inline-flex items-center gap-1"><MapPin size={14} className="text-slate-400" />{d.deliverTo}</span>
                    </p>
                    {d.notes && <p className="mt-1 text-sm text-slate-500">“{d.notes}”</p>}
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusCls[status]}`}>{t(status === 'open' ? 'Open' : status === 'filled' ? 'Filled' : 'Closed')}</span>
                </div>
                {d.filledQty > 0 && (
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-slate-500"><span>{t('{{n}} kg agreed', { n: d.filledQty.toLocaleString('en-IN') })}</span><span>{t('{{n}} kg still needed', { n: d.remaining.toLocaleString('en-IN') })}</span></div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} /></div>
                  </div>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button className="btn-outline" onClick={() => setOpenId((id) => (id === d._id ? null : d._id))}>
                    {openId === d._id ? t('Hide offers') : t('Offers ({{n}})', { n: d.pendingOffers ?? 0 })}
                  </button>
                  {d.isOpen && !d.expired && <button className="btn-outline text-red-600" disabled={busy} onClick={() => window.confirm(t('Close this request? Pending offers will be declined.')) && act(() => api.post(`/demands/${d._id}/close`))}>{t('Close request')}</button>}
                </div>

                {openId === d._id && (
                  <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                    {offers.length === 0 && <p className="text-sm text-slate-500">{t('No offers yet. Farmers are notified when they have this crop listed.')}</p>}
                    {offers.map((o) => (
                      <div key={o._id} className="rounded-lg border border-slate-200 p-3 text-sm">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold">{o.farmer.name} <Stars rating={o.farmer.rating} className="ml-1" /></p>
                            <p className="text-xs text-slate-500">{[o.listing.village, o.listing.district].filter(Boolean).join(', ')}{o.listing.grade ? ` · ${t('Grade {{g}}', { g: o.listing.grade })}` : ''}</p>
                          </div>
                          <p className="text-right text-lg font-extrabold text-brand-700">{inr(o.grandTotal)}<span className="block text-xs font-normal text-slate-500">{t('total')}</span></p>
                        </div>
                        <p className="mt-2 text-slate-700">{t('{{q}} kg at {{p}}/kg', { q: o.quantity.toLocaleString('en-IN'), p: inr(o.price) })} = {inr(o.total)}</p>
                        <p className="mt-1 flex items-center gap-1.5 text-slate-600">
                          <Truck size={14} className="text-slate-400" />
                          {o.transportBy === 'farmer' ? t('Farmer delivers: {{s}} ({{rate}}/km × {{km}} km) is included.', { s: inr(o.transportCharge), rate: inr(o.ratePerKm ?? 0), km: o.distanceKm ?? 0 }) : t('You collect or arrange transport. No transport cost added.')}
                        </p>
                        {o.message && <p className="mt-1 text-slate-500">“{o.message}”</p>}
                        {o.status === 'pending' && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button className="btn-primary" disabled={busy} onClick={() => window.confirm(t('Accept {{q}} kg at {{p}}/kg ({{total}})? This confirms the order.', { q: o.quantity, p: inr(o.price), total: inr(o.grandTotal) })) && act(() => api.post(`/demands/offers/${o._id}/accept`))}>{t('Accept offer')}</button>
                            <button className="btn-outline" disabled={busy} onClick={() => act(() => api.post(`/demands/offers/${o._id}/decline`))}>{t('Decline')}</button>
                          </div>
                        )}
                        {o.status === 'accepted' && o.orderId && <Link to={`/buyer/orders/${o.orderId}`} className="btn-outline mt-3">{t('View order')}</Link>}
                      </div>
                    ))}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
