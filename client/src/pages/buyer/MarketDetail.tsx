import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, BadgeCheck, CalendarClock, MapPin, ShoppingCart } from 'lucide-react'
import { api, errorMessage } from '../../api/client'
import { fmtDate, inr } from '../../api/crops'
import type { Crop, FarmerPublic } from '../../api/crops'
import Gallery from '../../components/Gallery'
import ReportButton from '../../components/ReportButton'
import DeliveryOption, { deliveryBody, emptyDelivery, transportCost } from '../../components/DeliveryOption'
import type { Delivery } from '../../components/DeliveryOption'
import { T } from '../../i18n'

export default function MarketDetail() {
  const { t } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState<{ listing: Crop; farmer: FarmerPublic; openRequestId: string | null } | null>(null)
  const [form, setForm] = useState({ quantity: '', price: '', message: '', neededBy: '' })
  const [delivery, setDelivery] = useState<Delivery>(emptyDelivery)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    api.get(`/marketplace/${id}`).then((r) => {
      setData(r.data)
      const l: Crop = r.data.listing
      setForm((f) => ({ ...f, quantity: String(l.minOrderQty ?? Math.min(l.availableQty, 100)), price: String(l.expectedPrice) }))
    }).catch((err) => setError(errorMessage(err)))
  }, [id])

  const back = (
    <Link to="/buyer/marketplace" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft size={16} /> {t('Back to marketplace')}</Link>
  )

  if (error) {
    return (
      <div className="space-y-4">
        {back}
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-600">{error}</div>
      </div>
    )
  }
  if (!data) return <p className="text-slate-500">{t('Loading…')}</p>

  const { listing: l, farmer: f, openRequestId } = data

  async function sendRequest(e: FormEvent) {
    e.preventDefault()
    setFormError('')
    setBusy(true)
    try {
      const body: Record<string, unknown> = { listingId: l._id, quantity: form.quantity, price: form.price, ...deliveryBody(delivery) }
      if (form.message.trim()) body.message = form.message.trim()
      if (form.neededBy) body.neededBy = form.neededBy
      const { data: res } = await api.post('/requests', body)
      navigate(`/buyer/requests/${res.request._id}`)
    } catch (err) {
      setFormError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  const total = Number(form.quantity) * Number(form.price)
  const shipping = transportCost(delivery)
  const rows: [string, string][] = [
    [T('Category'), t(l.category)],
    [T('Quality grade'), t('Grade {{g}}', { g: l.grade })],
    [T('Available'), t('{{a}} kg of {{b}} kg', { a: l.availableQty.toLocaleString('en-IN'), b: l.quantity.toLocaleString('en-IN') })],
    [T('Minimum order'), l.minOrderQty ? t('{{n}} kg', { n: l.minOrderQty }) : t('No minimum')],
    [T('Harvest date'), fmtDate(l.harvestDate)],
    [T('Available from'), l.availableFrom ? fmtDate(l.availableFrom) : t('Now')],
    [T('Sell by'), fmtDate(l.deadline)],
  ]

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {back}

      <div className="grid gap-5 md:grid-cols-[1.4fr_1fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <Gallery images={l.images} alt={l.crop} />
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-3xl font-bold">{l.crop}</h1>
              <p className="mt-1 flex items-center gap-1.5 text-sm capitalize text-slate-500"><MapPin size={15} />{l.village}, {l.district}</p>
            </div>
            <p className="text-right text-3xl font-extrabold text-brand-700">{inr(l.expectedPrice)}<span className="block text-sm font-medium text-slate-500">{t('per kg')}</span></p>
          </div>

          {l.description && <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{l.description}</p>}

          <dl className="mt-5 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            {rows.map(([k, v]) => (
              <div key={k}><dt className="text-slate-500">{t(k)}</dt><dd className="font-medium">{v}</dd></div>
            ))}
          </dl>

          <p className="mt-5 flex items-center gap-1.5 text-xs text-slate-500"><CalendarClock size={14} /> {t('Listed {{date}}', { date: fmtDate(l.createdAt) })}</p>
        </section>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{t('Sold by')}</p>
            <div className="mt-3 flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-brand-100 text-lg font-bold text-brand-700">{f.name[0]}</span>
              <div>
                <p className="font-semibold">{f.name}</p>
                <p className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700"><BadgeCheck size={14} /> {t('Verified farmer')}</p>
              </div>
            </div>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">{t('Location')}</dt><dd className="font-medium capitalize">{f.village}, {f.district}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">{t('Member since')}</dt><dd className="font-medium">{fmtDate(f.memberSince)}</dd></div>
              {f.rating && <div className="flex justify-between"><dt className="text-slate-500">{t('Rating')}</dt><dd className="font-medium">★ {f.rating.avg} <span className="text-slate-500">({f.rating.count})</span></dd></div>}
              <div className="flex justify-between"><dt className="text-slate-500">{t('Active listings')}</dt><dd className="font-medium">{f.activeListings}</dd></div>
            </dl>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            {openRequestId ? (
              <>
                <p className="text-sm text-slate-600">{t('You already have an open request for this listing.')}</p>
                <Link to={`/buyer/requests/${openRequestId}`} className="btn-primary mt-3 w-full">{t('View my request')}</Link>
              </>
            ) : (
              <form onSubmit={sendRequest} className="space-y-3">
                <h2 className="flex items-center gap-2 font-semibold"><ShoppingCart size={18} /> {t('Send purchase request')}</h2>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="mb-1 block text-xs font-medium">{t('Quantity (kg)')}</label><input className="input" type="number" min={l.minOrderQty ?? 1} max={l.availableQty} step="any" required value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></div>
                  <div><label className="mb-1 block text-xs font-medium">{t('Your price (₹/kg)')}</label><input className="input" type="number" min="0.5" step="any" required value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
                </div>
                {total > 0 && <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">{t('Total')}: <b>{inr(total + shipping)}</b>{shipping > 0 && <span className="text-slate-500"> {t('(crop {{c}} + transport {{s}})', { c: inr(total), s: inr(shipping) })}</span>}{Number(form.price) < l.expectedPrice && <span className="text-slate-500"> {t('(below asking price, farmer may counter)')}</span>}</p>}
                <DeliveryOption value={delivery} onChange={setDelivery} quantity={Number(form.quantity) || 0} />
                <div><label className="mb-1 block text-xs font-medium">{t('Needed by (optional)')}</label><input className="input" type="date" min={new Date().toISOString().slice(0, 10)} value={form.neededBy} onChange={(e) => setForm({ ...form, neededBy: e.target.value })} /></div>
                <div><label className="mb-1 block text-xs font-medium">{t('Message (optional)')}</label><input className="input" maxLength={300} placeholder={t('Need fresh tomatoes')} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></div>
                {formError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>}
                <button className="btn-primary w-full py-3" disabled={busy}>{busy ? t('Sending…') : t('Send request')}</button>
                <p className="text-center text-xs text-slate-500">{t('The farmer can accept, counter or decline. Phone numbers are shared only after acceptance.')}</p>
              </form>
            )}
          </section>

          <ReportButton targetType="listing" targetId={l._id} />
        </aside>
      </div>
    </div>
  )
}
