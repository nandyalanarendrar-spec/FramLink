import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, BadgeCheck, Info, MapPin, TrendingUp } from 'lucide-react'
import { api, errorMessage } from '../../api/client'
import { fmtDate, inr } from '../../api/crops'
import { sourceLabel } from '../../api/prices'
import type { CompareResult, TrendPoint } from '../../api/prices'
import PriceAlerts from './PriceAlerts'
import { dateLocale } from '../../i18n'

interface Outlook {
  verdict: 'good' | 'normal' | 'low' | null
  scope: string | null
  days: number
  latest?: number
  avg30?: number
  min30?: number
  max30?: number
  changePct?: number
  bestWeekday?: { day: number; upliftPct: number } | null
}

// Rule-based guide from the last 60 days of mandi prices: is today a good day to sell?
function OutlookCard({ o }: { o: Outlook }) {
  const { t } = useTranslation()
  const tone = o.verdict === 'good' ? 'border-brand-200 bg-brand-50 text-brand-900' : o.verdict === 'low' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-slate-200 bg-slate-50 text-slate-800'
  const pct = Math.abs(o.changePct ?? 0)
  const weekday = o.bestWeekday ? new Date(Date.UTC(2024, 0, 7 + o.bestWeekday.day)).toLocaleDateString(dateLocale(), { weekday: 'long', timeZone: 'UTC' }) : ''
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="flex items-center gap-2 font-semibold"><TrendingUp size={18} /> {t('Best time to sell')}</h2>
      {o.verdict === null ? (
        <p className="mt-3 text-sm text-slate-500">{t('Not enough price history for a suggestion yet. It needs at least 5 days of prices.')}</p>
      ) : (
        <>
          <p className={`mt-3 rounded-xl border p-3 text-sm font-medium ${tone}`}>
            {o.verdict === 'good' ? t('Good time to sell: the price is {{n}}% above its 30-day average.', { n: pct })
              : o.verdict === 'low' ? t('Prices are {{n}}% below the 30-day average. If your deadline allows, waiting may pay more.', { n: pct })
              : t('The price is close to its 30-day average.')}
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            {[[t('Now'), o.latest], [t('30-day average'), o.avg30], [t('30-day low'), o.min30], [t('30-day high'), o.max30]].map(([k, v]) => (
              <div key={String(k)} className="rounded-lg bg-slate-50 p-3"><dt className="text-xs text-slate-500">{k}</dt><dd className="font-bold">{inr(Number(v))}{t('/kg')}</dd></div>
            ))}
          </dl>
          {o.bestWeekday && <p className="mt-3 text-sm text-slate-600">{t('Prices have usually been about {{n}}% higher on {{day}}.', { n: o.bestWeekday.upliftPct, day: weekday })}</p>}
          <p className="mt-3 text-xs text-slate-500">{t('Based on the last {{d}} days of mandi prices {{where}}. It is a guide from past prices, not a guarantee.', { d: o.days, where: o.scope ? t('in {{place}}', { place: o.scope }) : t('across Andhra Pradesh') })}</p>
        </>
      )}
    </section>
  )
}

function TrendChart({ points }: { points: TrendPoint[] }) {
  const { t } = useTranslation()
  if (points.length < 2) return <p className="text-sm text-slate-500">{t('Not enough days of data for a trend yet.')}</p>
  const W = 400, H = 110, pad = 8
  const prices = points.map((p) => p.price)
  const lo = Math.min(...prices), hi = Math.max(...prices), span = hi - lo || 1
  const xy = points.map((p, i) => [pad + (i / (points.length - 1)) * (W - pad * 2), H - pad - ((p.price - lo) / span) * (H - pad * 2)])
  const line = xy.map(([x, y]) => `${x},${y}`).join(' ')
  const first = points[0], last = points[points.length - 1]
  const change = last.price - first.price
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-32 w-full" role="img" aria-label={t('Price trend')}>
        <polyline points={line} fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinejoin="round" />
        {xy.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3" fill="#16a34a" />)}
      </svg>
      <div className="flex justify-between text-xs text-slate-500">
        <span>{fmtDate(first.date)} · {inr(first.price)}</span>
        <span className={change >= 0 ? 'font-semibold text-brand-700' : 'font-semibold text-red-600'}>{change >= 0 ? '▲' : '▼'} {inr(Math.abs(Math.round(change * 100) / 100))}{t('/kg')}</span>
        <span>{fmtDate(last.date)} · {inr(last.price)}</span>
      </div>
    </div>
  )
}

export default function Prices() {
  const { t } = useTranslation()
  const [crops, setCrops] = useState<{ crop: string; markets: number }[]>([])
  const [districts, setDistricts] = useState<string[]>([])
  const [crop, setCrop] = useState('')
  const [quantity, setQuantity] = useState('1000')
  const [from, setFrom] = useState('')
  const [rate, setRate] = useState('12')
  const [vehicleKg, setVehicleKg] = useState('1000')
  const [data, setData] = useState<CompareResult | null>(null)
  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [outlook, setOutlook] = useState<Outlook | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    Promise.all([api.get('/prices/crops'), api.get('/prices/districts')])
      .then(([c, d]) => { setCrops(c.data.crops); setDistricts(d.data.districts); if (c.data.crops[0]) setCrop(c.data.crops[0].crop) })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setReady(true))
  }, [])

  useEffect(() => {
    if (!crop || !(Number(quantity) > 0)) return
    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const params: Record<string, string> = { crop, quantity, ratePerKm: rate || '12', vehicleKg: vehicleKg || '1000' }
        if (from) params.from = from
        const [c, tr, ol] = await Promise.all([
          api.get('/prices/compare', { params }),
          api.get('/prices/trend', { params: { crop, days: 30 } }),
          api.get('/prices/outlook', { params: { crop, ...(from && { district: from }) } }),
        ])
        setData(c.data)
        setTrend(tr.data.points)
        setOutlook(ol.data)
        setError('')
      } catch (err) {
        setError(errorMessage(err))
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [crop, quantity, from, rate, vehicleKg])

  if (ready && crops.length === 0) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
        <TrendingUp className="mx-auto text-slate-400" size={32} />
        <h1 className="mt-3 text-xl font-bold">{t('No market prices available yet')}</h1>
        <p className="mt-2 text-sm text-slate-600">{t('Price comparison uses real mandi prices entered or imported by the FarmLink admin. They will appear here as soon as they are added.')}</p>
      </div>
    )
  }

  const qty = Number(quantity) || 0
  const lowestNet = data ? Math.min(...data.markets.filter((m) => m.netRevenue != null).map((m) => m.netRevenue as number)) : 0

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">{t('Price Comparison')}</h1>
        <p className="text-sm text-slate-500">{t('Compare markets by what you would actually take home after transport: quantity × price − transport.')}</p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div><label className="mb-1 block text-xs font-medium">{t('Crop')}</label>
            <select className="input" value={crop} onChange={(e) => setCrop(e.target.value)}>{crops.map((c) => <option key={c.crop} value={c.crop}>{t('{{crop}} ({{n}} markets)', { crop: c.crop, n: c.markets })}</option>)}</select></div>
          <div><label className="mb-1 block text-xs font-medium">{t('Quantity (kg)')}</label>
            <input className="input" type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></div>
          <div><label className="mb-1 block text-xs font-medium">{t('Selling from (district)')}</label>
            <select className="input" value={from} onChange={(e) => setFrom(e.target.value)}><option value="">{t('My profile district')}</option>{districts.map((d) => <option key={d} value={d}>{d}</option>)}</select></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="mb-1 block text-xs font-medium">{t('₹ per km')}</label><input className="input" type="number" min="1" value={rate} onChange={(e) => setRate(e.target.value)} /></div>
            <div><label className="mb-1 block text-xs font-medium">{t('Vehicle (kg)')}</label><input className="input" type="number" min="100" value={vehicleKg} onChange={(e) => setVehicleKg(e.target.value)} /></div>
          </div>
        </div>
      </section>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {loading && !data && <p className="text-slate-500">{t('Comparing markets…')}</p>}

      {data && (
        <div className={loading ? 'opacity-60 transition' : 'transition'}>
          {data.stale && (
            <p className="mb-4 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"><AlertTriangle size={18} className="mt-0.5 shrink-0" />{t('The newest price is from {{date}}. Prices may have changed since, so treat these as a guide.', { date: fmtDate(data.newestDate ?? undefined) })}</p>
          )}
          {!data.fromDistrict && data.markets.length > 0 && (
            <p className="mb-4 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"><Info size={18} className="mt-0.5 shrink-0" />{t('Your district was not recognised, so transport and net revenue cannot be estimated. Pick “Selling from” above.')}</p>
          )}

          {data.markets.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-600">{t('No prices for {{crop}} in the last {{n}} days.', { crop: data.crop, n: data.assumptions.freshDays })}</div>
          ) : (
            <>
              {data.best && (
                <section className="rounded-2xl border border-brand-100 bg-brand-50 p-5">
                  <p className="text-xs font-bold uppercase tracking-wider text-brand-700">{t('Best estimated net revenue')}</p>
                  <p className="mt-1 text-2xl font-extrabold text-brand-800">{data.best.market}: {inr(data.best.netRevenue)}</p>
                  <p className="text-sm text-brand-800/80">
                    {t('for {{q}} kg of {{crop}}', { q: qty.toLocaleString('en-IN'), crop: data.crop })}
                    {Number.isFinite(lowestNet) && data.best.netRevenue > lowestNet && <> · {t('{{n}} more than the lowest option', { n: inr(data.best.netRevenue - lowestNet) })}</>}. {t('This is an estimate, not a guaranteed profit.')}
                  </p>
                </section>
              )}

              <section className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr><th className="p-3">{t('Market')}</th><th className="p-3">{t('Price per kg')}</th><th className="p-3">{t('Distance')}</th><th className="p-3">{t('Est. transport')}</th><th className="p-3">{t('Est. net revenue')}</th></tr>
                  </thead>
                  <tbody>
                    {data.markets.map((m) => {
                      const best = data.best?.market === m.market
                      return (
                        <tr key={`${m.market}-${m.source}`} className={`border-b border-slate-100 last:border-0 ${best ? 'bg-brand-50/60' : ''}`}>
                          <td className="p-3">
                            <p className="flex items-center gap-1 font-semibold">{m.market}{best && <BadgeCheck size={15} className="text-brand-600" />}</p>
                            <p className="flex items-center gap-1 text-xs capitalize text-slate-500"><MapPin size={12} />{m.district}</p>
                            <p className="text-xs text-slate-400">{fmtDate(m.date)} · {t(sourceLabel[m.source])}</p>
                          </td>
                          <td className="p-3"><p className="font-bold">{inr(m.modalPrice)}</p><p className="text-xs text-slate-500">{inr(m.minPrice)} – {inr(m.maxPrice)}</p></td>
                          <td className="p-3">{m.distanceKm == null ? '–' : `${m.distanceKm} km`}</td>
                          <td className="p-3">{m.transportCost == null ? '–' : inr(m.transportCost)}</td>
                          <td className="p-3"><p className={`font-bold ${best ? 'text-brand-700' : ''}`}>{m.netRevenue == null ? '–' : inr(m.netRevenue)}</p><p className="text-xs text-slate-500">{t('gross {{n}}', { n: inr(m.grossRevenue) })}</p></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </section>

              <p className="mt-2 text-xs text-slate-500">
                {t('Prices shown are each market’s most common (modal) price from the last {{days}} days. Transport is an estimate: distance by road (approx.) × ₹{{rate}}/km per {{kg}} kg vehicle, minimum ₹{{min}} per trip. Adjust the rate above to match real quotes.', {
                  days: data.assumptions.freshDays, rate: data.assumptions.ratePerKm, kg: data.assumptions.vehicleKg.toLocaleString('en-IN'), min: data.assumptions.minTripCharge,
                })}
              </p>
            </>
          )}

          {outlook && <div className="mt-5"><OutlookCard o={outlook} /></div>}

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="flex items-center gap-2 font-semibold"><TrendingUp size={18} /> {t('30-day trend (average modal price)')}</h2>
              <div className="mt-3"><TrendChart points={trend} /></div>
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="font-semibold">{t('On FarmLink')}</h2>
              <ul className="mt-3 space-y-3 text-sm">
                <li className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
                  <span>{t('Buyers paid (last 30 days)')}</span>
                  <span className="text-right font-semibold">{data.platform.orders ? <>{inr(data.platform.orders.avgPrice)}{t('/kg')}<span className="block text-xs font-normal text-slate-500">{t('{{n}} order(s)', { n: data.platform.orders.orders })}</span></> : <span className="font-normal text-slate-400">{t('No orders yet')}</span>}</span>
                </li>
                <li className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
                  <span>{t('Farmers asking now')}</span>
                  <span className="text-right font-semibold">{data.platform.listings ? <>{inr(data.platform.listings.avgPrice)}{t('/kg')}<span className="block text-xs font-normal text-slate-500">{t('{{n}} listing(s)', { n: data.platform.listings.listings })}</span></> : <span className="font-normal text-slate-400">{t('No live listings')}</span>}</span>
                </li>
              </ul>
              <p className="mt-3 text-xs text-slate-500">{t('This is FarmLink activity only, not the whole market.')}</p>
            </section>
          </div>
        </div>
      )}

      <PriceAlerts crops={crops.map((c) => c.crop)} />
    </div>
  )
}
