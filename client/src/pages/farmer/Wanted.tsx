import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'
import { CalendarClock, MapPin, Megaphone, Search } from 'lucide-react'
import { api, errorMessage } from '../../api/client'
import { fmtDate, inr } from '../../api/crops'
import type { BoardDemand, MyOffer } from '../../api/demands'
import OfferDialog from '../../components/OfferDialog'
import Stars from '../../components/Stars'

const offerCls = { pending: 'bg-blue-100 text-blue-700', accepted: 'bg-brand-100 text-brand-700', declined: 'bg-slate-200 text-slate-600', withdrawn: 'bg-slate-200 text-slate-600' } as const

// Farmer: everything buyers want. Answer from your own live listing with a price and who handles transport.
export default function Wanted() {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const [tab, setTab] = useState<'board' | 'offers'>(params.get('tab') === 'offers' ? 'offers' : 'board')
  const [q, setQ] = useState('')
  const [place, setPlace] = useState('')
  const [board, setBoard] = useState<BoardDemand[]>([])
  const [offers, setOffers] = useState<MyOffer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [offering, setOffering] = useState<BoardDemand | null>(null)
  const [busyId, setBusyId] = useState('')

  const load = useCallback(async () => {
    try {
      if (tab === 'board') {
        const { data } = await api.get('/demands/board', { params: { ...(q.trim() && { q: q.trim() }), ...(place.trim() && { place: place.trim() }) } })
        setBoard(data.demands)
      } else {
        const { data } = await api.get('/demands/offers/mine')
        setOffers(data.offers)
      }
      setError('')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [tab, q, place])

  useEffect(() => {
    setLoading(true)
    const timer = setTimeout(load, 300)
    return () => clearTimeout(timer)
  }, [load])

  async function withdraw(id: string) {
    setBusyId(id)
    try {
      await api.post(`/demands/offers/${id}/withdraw`)
      await load()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusyId('')
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">{t('Buyers Wanted')}</h1>
        <p className="text-sm text-slate-500">{t('What buyers are looking for right now. If you have it, send an offer with your price and transport.')}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {([['board', t('Open requests')], ['offers', t('My offers')]] as const).map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)} className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${tab === v ? 'bg-brand-600 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>{l}</button>
        ))}
      </div>

      {tab === 'board' && (
        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input py-2.5 pl-10" placeholder={t('Search crop, e.g. Tomato')} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <input className="input w-56 py-2.5" placeholder={t('Delivery place')} value={place} onChange={(e) => setPlace(e.target.value)} />
        </div>
      )}

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {loading ? (
        <p className="text-slate-500">{t('Loading…')}</p>
      ) : tab === 'board' ? (
        board.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <Megaphone className="mx-auto text-slate-400" size={32} />
            <p className="mt-2 font-semibold">{t('No open requests right now')}</p>
          </div>
        ) : (
          <ul className="grid gap-4 lg:grid-cols-2">
            {board.map((d) => (
              <li key={d._id} className="flex flex-col rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-bold">{d.crop}</h3>
                    <p className="text-sm text-slate-500">{d.buyer.name}{d.buyer.type ? ` · ${t(d.buyer.type)}` : ''} <Stars rating={d.buyer.rating} className="ml-1" /></p>
                  </div>
                  <p className="text-right text-xl font-extrabold text-brand-700">{inr(d.maxPrice)}<span className="block text-xs font-medium text-slate-500">{t('max per kg')}</span></p>
                </div>
                <ul className="mt-3 space-y-1 text-sm text-slate-600">
                  <li><b>{t('{{n}} kg', { n: d.remaining.toLocaleString('en-IN') })}</b> {t('still needed')}</li>
                  <li className="flex items-center gap-1.5"><CalendarClock size={15} className="text-slate-400" />{t('Needed by {{date}}', { date: fmtDate(d.neededBy) })}</li>
                  <li className="flex items-center gap-1.5"><MapPin size={15} className="text-slate-400" />{d.deliverTo}</li>
                  {d.notes && <li className="text-slate-500">“{d.notes}”</li>}
                </ul>
                <div className="mt-4 flex flex-1 flex-wrap items-end gap-2 border-t border-slate-100 pt-4">
                  {d.myOffer ? (
                    <p className="flex flex-1 items-center justify-between gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
                      <span>{t('Your offer')}: {t('{{q}} kg at {{p}}/kg', { q: d.myOffer.quantity.toLocaleString('en-IN'), p: inr(d.myOffer.price) })}</span>
                      <button className="font-semibold underline" disabled={busyId === d.myOffer._id} onClick={() => withdraw(d.myOffer!._id)}>{t('Withdraw')}</button>
                    </p>
                  ) : d.matching.length > 0 ? (
                    <button className="btn-primary" onClick={() => setOffering(d)}>{t('Make an offer')}</button>
                  ) : (
                    <p className="text-sm text-slate-500">{t('You have no live {{crop}} listing.', { crop: d.crop })} <Link to="/farmer/crops/new" className="font-semibold text-brand-700 underline">{t('List it first')}</Link></p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )
      ) : offers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center"><p className="font-semibold">{t('You have not made any offers yet')}</p></div>
      ) : (
        <ul className="space-y-3">
          {offers.map((o) => (
            <li key={o._id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
              <div>
                <p className="font-semibold">{o.demand?.crop} · {t('{{q}} kg at {{p}}/kg', { q: o.quantity.toLocaleString('en-IN'), p: inr(o.price) })}</p>
                <p className="text-sm text-slate-500">
                  {o.transportBy === 'farmer' ? t('You deliver (transport {{s}})', { s: inr(o.transportCharge) }) : t('Buyer collects')} · {t('Total {{n}}', { n: inr(o.grandTotal) })} · {o.demand?.deliverTo}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${offerCls[o.status]}`}>{t(o.status === 'pending' ? 'Waiting for buyer' : o.status === 'accepted' ? 'Accepted' : o.status === 'declined' ? 'Declined' : 'Withdrawn')}</span>
                {o.status === 'pending' && <button className="btn-outline" disabled={busyId === o._id} onClick={() => withdraw(o._id)}>{t('Withdraw')}</button>}
                {o.status === 'accepted' && o.orderId && <Link to={`/farmer/orders/${o.orderId}`} className="btn-primary">{t('View order')}</Link>}
              </div>
            </li>
          ))}
        </ul>
      )}

      {offering && <OfferDialog demand={offering} onClose={() => setOffering(null)} onSent={() => { setOffering(null); setTab('offers') }} />}
    </div>
  )
}
