import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { AlertTriangle, CalendarClock, MapPin, Plus, RefreshCw, Sprout } from 'lucide-react'
import { api, errorMessage } from '../../api/client'
import { fmtDate, inr, statusMeta } from '../../api/crops'
import type { Crop, CropStatus } from '../../api/crops'
import { useAuth } from '../../context/AuthContext'
import Recommendations from './Recommendations'
import { T } from '../../i18n'

// "Relist": a new listing from an old one with today's date, a new deadline and, if you like, a new quantity and price
function RelistDialog({ crop, onClose, onDone }: { crop: Crop; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation()
  const week = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)
  const [f, setF] = useState({ quantity: String(crop.quantity), expectedPrice: String(crop.expectedPrice), deadline: week })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await api.post(`/crops/${crop._id}/relist`, f)
      onDone()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl">
        <div>
          <h2 className="text-lg font-bold">{t('Relist {{crop}}', { crop: crop.crop })}</h2>
          <p className="text-sm text-slate-500">{t('Same crop, grade, village, description and photos. Harvest date is set to today.')}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="mb-1 block text-xs font-medium">{t('Quantity (kg)')}</label><input className="input" type="number" min="1" step="any" required value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} /></div>
          <div><label className="mb-1 block text-xs font-medium">{t('Price (₹/kg)')}</label><input className="input" type="number" min="0.5" step="any" required value={f.expectedPrice} onChange={(e) => setF({ ...f, expectedPrice: e.target.value })} /></div>
          <div className="col-span-2"><label className="mb-1 block text-xs font-medium">{t('Sell by (deadline)')}</label><input className="input" type="date" required min={new Date().toISOString().slice(0, 10)} value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} /></div>
        </div>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex gap-2"><button className="btn-primary" disabled={busy}>{busy ? t('Publishing…') : t('Relist and publish')}</button><button type="button" className="btn-outline" onClick={onClose}>{t('Cancel')}</button></div>
      </form>
    </div>
  )
}

type Filter = 'all' | CropStatus
const tabs: Filter[] = ['all', 'active', 'partially_sold', 'draft', 'paused', 'sold_out', 'expired', 'withdrawn']
const tabLabel = (v: Filter) => (v === 'all' ? T('All') : statusMeta[v].label)

export default function Crops() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const verified = user?.verificationStatus === 'verified'

  const [filter, setFilter] = useState<Filter>('all')
  const [relistFor, setRelistFor] = useState<Crop | null>(null)
  const [recFor, setRecFor] = useState<string | null>(null) // listing whose suggested buyers are open
  const [crops, setCrops] = useState<Crop[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const { data } = await api.get('/crops/mine', { params: { status: filter === 'all' ? undefined : filter } })
      setCrops(data.listings)
      setCounts(data.counts)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { load() }, [load])

  async function changeStatus(c: Crop, status: 'active' | 'paused' | 'withdrawn') {
    if (status === 'withdrawn' && !window.confirm(t('Withdraw "{{crop}}"? Buyers will no longer see it.', { crop: c.crop }))) return
    setError('')
    try {
      await api.patch(`/crops/${c._id}/status`, { status })
      await load()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  async function remove(c: Crop) {
    if (!window.confirm(t('Delete draft "{{crop}}"?', { crop: c.crop }))) return
    setError('')
    try {
      await api.delete(`/crops/${c._id}`)
      await load()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  const countFor = (v: Filter) => (v === 'all' ? total : counts[v] ?? 0)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('My Crop Listings')}</h1>
          <p className="text-sm text-slate-500">{t('Publish what you have, buyers will find it in the marketplace.')}</p>
        </div>
        <Link to="/farmer/crops/new" className="btn-primary gap-2"><Plus size={18} /> {t('Add new crop')}</Link>
      </div>

      {!verified && (
        <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 shrink-0" size={18} />
          <p>{t('Your account is not verified yet. You can save drafts now, and publish once an admin verifies you.')}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {tabs.map((tb) => (
          <button
            key={tb}
            onClick={() => setFilter(tb)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
              filter === tb ? 'bg-brand-600 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {t(tabLabel(tb))} <span className="opacity-70">({countFor(tb)})</span>
          </button>
        ))}
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {loading ? (
        <p className="text-slate-500">{t('Loading…')}</p>
      ) : crops.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <Sprout className="mx-auto text-brand-600" size={32} />
          <p className="mt-2 font-semibold">{filter === 'all' ? t('No crops listed yet') : t('No {{status}} listings', { status: t(tabLabel(filter)).toLowerCase() })}</p>
          {filter === 'all' && <Link to="/farmer/crops/new" className="btn-primary mt-4 gap-2"><Plus size={16} /> {t('Add your first crop')}</Link>}
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {crops.map((c) => {
            const sold = c.quantity - c.availableQty
            const pct = Math.round((sold / c.quantity) * 100)
            return (
              <li key={c._id} className="flex flex-col rounded-xl border border-slate-200 bg-white p-5">
                {c.images?.[0] && <img src={c.images[0]} alt={c.crop} className="mb-3 h-36 w-full rounded-lg object-cover" />}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-bold">{c.crop}</h3>
                    <p className="text-xs text-slate-500">{t(c.category)} · {t('Grade {{g}}', { g: c.grade })}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusMeta[c.status].cls}`}>{t(statusMeta[c.status].label)}</span>
                </div>

                <p className="mt-3 text-2xl font-extrabold text-brand-700">{inr(c.expectedPrice)}<span className="text-sm font-medium text-slate-500"> {t('/kg')}</span></p>

                <div className="mt-3">
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>{t('{{n}} kg available', { n: c.availableQty.toLocaleString('en-IN') })}</span>
                    <span>{t('of {{n}} kg', { n: c.quantity.toLocaleString('en-IN') })}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>

                <ul className="mt-3 space-y-1 text-xs text-slate-600">
                  <li className="flex items-center gap-1.5"><MapPin size={14} className="text-slate-400" />{c.village}, {c.district}</li>
                  <li className="flex items-center gap-1.5"><CalendarClock size={14} className="text-slate-400" />{t('Harvest {{h}} · Sell by {{d}}', { h: fmtDate(c.harvestDate), d: fmtDate(c.deadline) })}</li>
                </ul>

                <div className="mt-4 flex flex-1 flex-wrap items-end gap-2 border-t border-slate-100 pt-4">
                  {['draft', 'active', 'partially_sold', 'paused'].includes(c.status) && (
                    <Link to={`/farmer/crops/${c._id}/edit`} className="btn-outline">{t('Edit')}</Link>
                  )}
                  {c.status === 'draft' && (
                    <>
                      <button className="btn-primary" disabled={!verified} title={verified ? '' : t('Available after admin verification')} onClick={() => changeStatus(c, 'active')}>{t('Publish')}</button>
                      <button className="btn-outline text-red-600" onClick={() => remove(c)}>{t('Delete')}</button>
                    </>
                  )}
                  {(c.status === 'active' || c.status === 'partially_sold') && (
                    <button className="btn-outline" onClick={() => changeStatus(c, 'paused')}>{t('Pause')}</button>
                  )}
                  {c.status === 'paused' && (
                    <button className="btn-primary" disabled={!verified} onClick={() => changeStatus(c, 'active')}>{t('Resume')}</button>
                  )}
                  {['active', 'partially_sold', 'paused'].includes(c.status) && (
                    <button className="btn-outline text-red-600" onClick={() => changeStatus(c, 'withdrawn')}>{t('Withdraw')}</button>
                  )}
                  {['sold_out', 'expired', 'withdrawn'].includes(c.status) && (
                    <button className="btn-primary gap-1.5" disabled={!verified} onClick={() => setRelistFor(c)}><RefreshCw size={15} /> {t('Relist')}</button>
                  )}
                  {['active', 'partially_sold', 'paused'].includes(c.status) && c.availableQty > 0 && (c.status === 'partially_sold' || new Date(c.deadline).getTime() - Date.now() < 3 * 864e5) && (
                    <Link to={`/farmer/crops/${c._id}/leftover`} className="btn-primary">{t('Sell the rest')}</Link>
                  )}
                  {(c.status === 'active' || c.status === 'partially_sold') && (
                    <button className="btn-outline" onClick={() => setRecFor((id) => (id === c._id ? null : c._id))}>{recFor === c._id ? t('Hide buyers') : t('Suggested buyers')}</button>
                  )}
                </div>
                {recFor === c._id && <Recommendations listingId={c._id} />}
              </li>
            )
          })}
        </ul>
      )}
      {relistFor && <RelistDialog crop={relistFor} onClose={() => setRelistFor(null)} onDone={() => { setRelistFor(null); setFilter('active'); load() }} />}
    </div>
  )
}
