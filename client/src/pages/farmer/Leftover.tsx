import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarClock, Megaphone, MessageCircle, Users } from 'lucide-react'
import { api, errorMessage } from '../../api/client'
import { fmtDate, inr } from '../../api/crops'
import type { Crop } from '../../api/crops'
import type { BoardDemand } from '../../api/demands'
import type { CompareResult, PriceReference } from '../../api/prices'
import OfferDialog from '../../components/OfferDialog'
import Recommendations from './Recommendations'

const DAY = 864e5
const Card = ({ icon: Icon, title, children }: { icon?: typeof Users; title: string; children: React.ReactNode }) => (
  <section className="rounded-2xl border border-slate-200 bg-white p-5">
    <h2 className="flex items-center gap-2 font-semibold">{Icon && <Icon size={18} className="text-brand-700" />} {title}</h2>
    <div className="mt-3">{children}</div>
  </section>
)

// "I still have stock left. Where do I sell it?" Everything here is real: open buyer requests, past buyers,
// market prices after transport, and quick price/deadline changes.
export default function Leftover() {
  const { t } = useTranslation()
  const { id } = useParams()
  const [crop, setCrop] = useState<Crop | null>(null)
  const [wanted, setWanted] = useState<BoardDemand[]>([])
  const [markets, setMarkets] = useState<CompareResult | null>(null)
  const [reference, setReference] = useState<PriceReference | null>(null)
  const [newPrice, setNewPrice] = useState('')
  const [offering, setOffering] = useState<BoardDemand | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/crops/${id}`)
      const c: Crop = data.listing
      setCrop(c)
      setNewPrice((p) => p || String(c.expectedPrice))
      // These three are independent and any of them may have nothing for this crop
      const [w, m, r] = await Promise.allSettled([
        api.get('/demands/board', { params: { q: c.crop } }),
        api.get('/prices/compare', { params: { crop: c.crop, quantity: Math.max(1, c.availableQty), from: c.district } }),
        api.get('/prices/suggest', { params: { crop: c.crop } }),
      ])
      setWanted(w.status === 'fulfilled' ? (w.value.data.demands as BoardDemand[]).filter((d) => d.crop.toLowerCase() === c.crop.toLowerCase()) : [])
      setMarkets(m.status === 'fulfilled' ? m.value.data : null)
      setReference(r.status === 'fulfilled' ? r.value.data.reference : null)
      setError('')
    } catch (err) {
      setError(errorMessage(err))
    }
  }, [id])
  useEffect(() => { load() }, [load])

  async function adjust(body: { expectedPrice?: number | string; deadline?: string }) {
    setBusy(true)
    setError('')
    try {
      await api.post(`/crops/${id}/adjust`, body)
      await load()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const back = <Link to="/farmer/crops" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft size={16} /> {t('Back to listings')}</Link>
  if (!crop) return <div className="space-y-4">{back}{error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : <p className="text-slate-500">{t('Loading…')}</p>}</div>

  const live = ['active', 'partially_sold', 'paused'].includes(crop.status) && crop.availableQty > 0
  const daysLeft = Math.ceil((new Date(crop.deadline).getTime() - Date.now()) / DAY)
  const urgent = daysLeft <= 2
  const extend = (days: number) => adjust({ deadline: new Date(Math.max(new Date(crop.deadline).getTime(), Date.now()) + days * DAY).toISOString().slice(0, 10) })
  const above = reference && crop.expectedPrice > reference.median * 1.02
  const top = (markets?.markets ?? []).filter((m) => m.netRevenue != null).slice(0, 3)

  const shareText = t('{{crop}} for sale: {{n}} kg at {{p}}/kg from {{place}}. Order on FarmLink: {{url}}', { crop: crop.crop, n: crop.availableQty.toLocaleString('en-IN'), p: inr(crop.expectedPrice), place: `${crop.village}, ${crop.district}`, url: window.location.origin })
  async function copy() {
    try {
      await navigator.clipboard.writeText(shareText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError(t('Could not copy. Select the text and copy it.'))
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {back}
      <div>
        <h1 className="text-2xl font-bold">{t('Sell the rest of your {{crop}}', { crop: crop.crop })}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
          <span><b>{t('{{n}} kg', { n: crop.availableQty.toLocaleString('en-IN') })}</b> {t('unsold of {{n}} kg', { n: crop.quantity.toLocaleString('en-IN') })}</span>
          <span className="font-semibold text-brand-700">{inr(crop.expectedPrice)}{t('/kg')}</span>
          <span className={`inline-flex items-center gap-1 ${urgent ? 'font-semibold text-amber-700' : ''}`}><CalendarClock size={14} />{daysLeft <= 0 ? t('Ends today') : t('Ends in {{n}} day(s), {{date}}', { n: daysLeft, date: fmtDate(crop.deadline) })}</span>
        </p>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {!live ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="font-semibold">{crop.availableQty <= 0 ? t('Nothing left to sell on this listing.') : t('This listing is not live any more.')}</p>
          <p className="mt-1 text-sm text-slate-500">{t('You can relist it from My Crop Listings.')}</p>
        </div>
      ) : (
        <>
          <Card icon={Megaphone} title={t('1. Buyers asking for {{crop}} right now', { crop: crop.crop })}>
            {wanted.length === 0 ? (
              <p className="text-sm text-slate-500">{t('No open buyer requests for {{crop}} at the moment. New ones will appear on the Buyers Wanted page.', { crop: crop.crop })}</p>
            ) : (
              <ul className="space-y-2">
                {wanted.map((d) => (
                  <li key={d._id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-3 text-sm">
                    <div>
                      <p className="font-semibold">{d.buyer.name} · {t('{{n}} kg', { n: d.remaining.toLocaleString('en-IN') })} · {t('Up to {{p}}/kg', { p: inr(d.maxPrice) })}</p>
                      <p className="text-slate-500">{d.deliverTo} · {t('Needed by {{date}}', { date: fmtDate(d.neededBy) })}{crop.expectedPrice > d.maxPrice ? ` · ${t('their maximum is below your price')}` : ''}</p>
                    </div>
                    {d.myOffer ? <span className="text-xs font-semibold text-blue-700">{t('Offer sent')}</span> : <button className="btn-primary" onClick={() => setOffering(d)}>{t('Offer the rest')}</button>}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card icon={Users} title={t('2. Buyers who may want it')}>
            <Recommendations listingId={crop._id} />
          </Card>

          <Card title={t('3. Best markets for {{n}} kg', { n: crop.availableQty.toLocaleString('en-IN') })}>
            {top.length === 0 ? (
              <p className="text-sm text-slate-500">{t('No recent market prices for {{crop}} yet.', { crop: crop.crop })}</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs uppercase text-slate-500"><tr><th className="py-2">{t('Market')}</th><th>{t('Price per kg')}</th><th>{t('Distance')}</th><th>{t('Transport')}</th><th className="text-right">{t('Net revenue')}</th></tr></thead>
                    <tbody>
                      {top.map((m) => (
                        <tr key={m.market} className="border-t border-slate-100">
                          <td className="py-2 font-medium">{m.market}<span className="block text-xs font-normal text-slate-500">{m.district}</span></td>
                          <td>{inr(m.modalPrice)}</td>
                          <td>{m.distanceKm != null ? `${m.distanceKm} km` : '—'}</td>
                          <td>{m.transportCost != null ? inr(m.transportCost) : '—'}</td>
                          <td className="text-right font-bold text-brand-700">{inr(m.netRevenue as number)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-xs text-slate-500">{t('Estimates from real mandi prices minus transport. Not a guaranteed profit.')} <Link to="/farmer/prices" className="font-semibold text-brand-700 underline">{t('Full comparison')}</Link></p>
              </>
            )}
          </Card>

          <Card title={t('4. Adjust your price and deadline')}>
            {reference ? (
              <p className={`rounded-lg p-3 text-sm ${above ? 'bg-amber-50 text-amber-900' : 'bg-slate-50 text-slate-700'}`}>
                {t('Market price is around {{m}}/kg (range {{lo}} to {{hi}}, {{n}} markets).', { m: inr(reference.median), lo: inr(reference.low), hi: inr(reference.high), n: reference.markets })}{' '}
                {above ? t('You are asking {{p}}/kg, above the market. A lower price may sell the rest faster.', { p: inr(crop.expectedPrice) }) : t('Your price is at or below the market.')}
              </p>
            ) : (
              <p className="text-sm text-slate-500">{t('No market price to compare with yet.')}</p>
            )}
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <div><label className="mb-1 block text-xs font-medium">{t('New price (₹/kg)')}</label><input className="input w-32" type="number" min="0.5" step="any" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} /></div>
              <button className="btn-primary" disabled={busy || !(Number(newPrice) > 0) || Number(newPrice) === crop.expectedPrice} onClick={() => adjust({ expectedPrice: newPrice })}>{t('Update price')}</button>
              {above && <button className="btn-outline" disabled={busy} onClick={() => reference && adjust({ expectedPrice: reference.median }).then(() => setNewPrice(String(reference.median)))}>{t('Match market ({{p}})', { p: inr(reference.median) })}</button>}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-sm text-slate-600">{t('More time to sell')}:</span>
              <button className="btn-outline" disabled={busy} onClick={() => extend(3)}>{t('+3 days')}</button>
              <button className="btn-outline" disabled={busy} onClick={() => extend(7)}>{t('+7 days')}</button>
            </div>
          </Card>

          <Card icon={MessageCircle} title={t('5. Tell your own buyers')}>
            <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{shareText}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a className="btn-primary" href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer">{t('Share on WhatsApp')}</a>
              <button className="btn-outline" onClick={copy}>{copied ? t('Copied') : t('Copy text')}</button>
            </div>
          </Card>
        </>
      )}

      {offering && <OfferDialog demand={offering} onClose={() => setOffering(null)} onSent={() => { setOffering(null); load() }} />}
    </div>
  )
}
