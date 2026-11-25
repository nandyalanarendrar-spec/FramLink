import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle, BadgeCheck, ExternalLink, MapPin, Navigation,
  TrendingDown, TrendingUp, Minus, Star, Zap, Route,
} from 'lucide-react'
import { api, errorMessage } from '../../api/client'
import { fmtDate, inr } from '../../api/crops'

interface TrendPoint { date: string; price: number }
interface MarketRow {
  market: string; district: string; minPrice: number; modalPrice: number; maxPrice: number
  date: string; source: string; distanceKm: number | null; transportCost: number | null
  grossRevenue: number; netRevenue: number | null; trend: TrendPoint[]; trendPct: number | null
  coords: [number, number] | null
}
interface Rec { market: string; district: string; netRevenue: number | null; distanceKm: number | null; reason: string }
interface NearbyData {
  crop: string; quantity: number; farmerDistrict: string | null; days: number
  markets: MarketRow[]; byDistance: MarketRow[]
  recommendation: { bestValue: Rec | null; nearest: Rec | null; smartPick: Rec | null }
  weeklyInsights: { risingCount: number; fallingCount: number; totalMarkets: number; avgModal: number | null }
}

// Mini SVG sparkline for 7-day trend
function Sparkline({ points, rising }: { points: TrendPoint[]; rising: boolean | null }) {
  if (points.length < 2) return <span className="text-xs text-slate-400">—</span>
  const W = 80, H = 28, pad = 2
  const prices = points.map((p) => p.price)
  const lo = Math.min(...prices), hi = Math.max(...prices), span = hi - lo || 1
  const xy = points.map((p, i) => [
    pad + (i / (points.length - 1)) * (W - pad * 2),
    H - pad - ((p.price - lo) / span) * (H - pad * 2),
  ])
  const line = xy.map(([x, y]) => `${x},${y}`).join(' ')
  const color = rising === true ? '#16a34a' : rising === false ? '#dc2626' : '#64748b'
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-7 w-20" aria-label="7-day price trend">
      <polyline points={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      {xy.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2" fill={color} />)}
    </svg>
  )
}

function googleMapsUrl(farmerDistrict: string | null, market: string, district: string) {
  const origin = farmerDistrict ? `${farmerDistrict}, Andhra Pradesh, India` : 'Andhra Pradesh, India'
  const dest = `${market}, ${district}, Andhra Pradesh, India`
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(dest)}&travelmode=driving`
}

function RecommendCard({ rec, label, icon: Icon, color }: { rec: Rec; label: string; icon: React.ElementType; color: string }) {
  const { t } = useTranslation()
  return (
    <div className={`rounded-2xl border-2 ${color} p-4`}>
      <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide">
        <Icon size={16} /> {label}
      </div>
      <p className="mt-2 text-lg font-extrabold">{rec.market}</p>
      <p className="flex items-center gap-1 text-sm text-slate-600"><MapPin size={12} />{rec.district}</p>
      <div className="mt-2 flex flex-wrap gap-3 text-sm">
        {rec.distanceKm != null && <span className="font-medium">🚛 {rec.distanceKm} km away</span>}
        {rec.netRevenue != null && <span className="font-medium">💰 Est. {inr(rec.netRevenue)} net</span>}
      </div>
      <p className="mt-1 text-xs text-slate-500 italic">{rec.reason}</p>
    </div>
  )
}

export default function NearbyMarkets() {
  const { t } = useTranslation()
  const [crops, setCrops] = useState<{ crop: string; markets: number }[]>([])
  const [crop, setCrop] = useState('')
  const [quantity, setQuantity] = useState('1000')
  const [days, setDays] = useState('7')
  const [sortBy, setSortBy] = useState<'value' | 'distance' | 'price'>('value')
  const [data, setData] = useState<NearbyData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    api.get('/prices/crops')
      .then(({ data: d }) => { setCrops(d.crops); if (d.crops[0]) setCrop(d.crops[0].crop) })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setReady(true))
  }, [])

  useEffect(() => {
    if (!crop || !(Number(quantity) > 0)) return
    setLoading(true); setError('')
    const timer = setTimeout(async () => {
      try {
        const { data: d } = await api.get('/prices/nearby', { params: { crop, quantity, days } })
        setData(d)
      } catch (err) { setError(errorMessage(err)) }
      finally { setLoading(false) }
    }, 400)
    return () => clearTimeout(timer)
  }, [crop, quantity, days])

  if (ready && crops.length === 0) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
        <MapPin className="mx-auto text-slate-400" size={32} />
        <h1 className="mt-3 text-xl font-bold">{t('No market price data yet')}</h1>
        <p className="mt-2 text-sm text-slate-600">{t('Ask your FarmLink admin to import mandi prices so local markets appear here.')}</p>
      </div>
    )
  }

  const displayMarkets = (() => {
    if (!data) return []
    if (sortBy === 'distance') return data.byDistance
    if (sortBy === 'price') return [...data.markets].sort((a, b) => b.modalPrice - a.modalPrice)
    return data.markets // best value first
  })()

  const { recommendation: rec, weeklyInsights: wi } = data ?? { recommendation: {}, weeklyInsights: {} }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Route size={24} /> {t('Find Nearby Markets')}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {t("Can't sell fully on FarmLink? Find the best local mandi for your crop — compare prices, distance, and 7-day trends, then navigate directly.")}
        </p>
      </div>

      {/* Controls */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium">{t('Crop')}</label>
            <select className="input" value={crop} onChange={(e) => setCrop(e.target.value)}>
              {crops.map((c) => <option key={c.crop} value={c.crop}>{c.crop} ({c.markets} markets)</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">{t('Quantity to sell (kg)')}</label>
            <input className="input" type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">{t('Trend window')}</label>
            <select className="input" value={days} onChange={(e) => setDays(e.target.value)}>
              <option value="7">Last 7 days</option>
              <option value="14">Last 14 days</option>
              <option value="30">Last 30 days</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">{t('Sort markets by')}</label>
            <select className="input" value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
              <option value="value">Best net revenue</option>
              <option value="distance">Nearest first</option>
              <option value="price">Highest price</option>
            </select>
          </div>
        </div>
      </section>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {loading && <p className="text-slate-500 text-sm">{t('Finding markets…')}</p>}

      {data && (
        <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>

          {/* Weekly insights bar */}
          <section className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
              <p className="text-2xl font-extrabold text-slate-800">{wi.totalMarkets}</p>
              <p className="text-xs text-slate-500">Markets found</p>
            </div>
            <div className="rounded-xl border border-brand-100 bg-brand-50 p-3 text-center">
              <p className="text-2xl font-extrabold text-brand-700">{wi.avgModal ? inr(wi.avgModal) : '—'}</p>
              <p className="text-xs text-slate-500">Avg modal price/kg</p>
            </div>
            <div className="rounded-xl border border-green-100 bg-green-50 p-3 text-center">
              <p className="flex items-center justify-center gap-1 text-2xl font-extrabold text-green-700"><TrendingUp size={18} />{wi.risingCount}</p>
              <p className="text-xs text-slate-500">Markets rising ({days}d)</p>
            </div>
            <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-center">
              <p className="flex items-center justify-center gap-1 text-2xl font-extrabold text-red-700"><TrendingDown size={18} />{wi.fallingCount}</p>
              <p className="text-xs text-slate-500">Markets falling ({days}d)</p>
            </div>
          </section>

          {/* Recommendation cards */}
          {(rec.smartPick || rec.bestValue || rec.nearest) && (
            <section className="space-y-3">
              <h2 className="flex items-center gap-2 font-semibold"><Star size={16} className="text-yellow-500" /> {t('Our Recommendation')}</h2>
              <div className="grid gap-3 md:grid-cols-3">
                {rec.smartPick && <RecommendCard rec={rec.smartPick} label="Smart Pick" icon={Zap} color="border-yellow-300 bg-yellow-50" />}
                {rec.bestValue && rec.bestValue.market !== rec.smartPick?.market && (
                  <RecommendCard rec={rec.bestValue} label="Best Value" icon={BadgeCheck} color="border-brand-200 bg-brand-50" />
                )}
                {rec.nearest && rec.nearest.market !== rec.smartPick?.market && (
                  <RecommendCard rec={rec.nearest} label="Nearest" icon={MapPin} color="border-blue-200 bg-blue-50" />
                )}
              </div>
            </section>
          )}

          {/* No farmer district warning */}
          {!data.farmerDistrict && (
            <p className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle size={16} className="shrink-0" />
              {t('Your district was not found in your profile. Distance and transport estimates are unavailable. Update your profile to enable them.')}
            </p>
          )}

          {/* Market cards */}
          <section className="space-y-3">
            <h2 className="font-semibold">{t('All Markets for {{crop}}', { crop: data.crop })}</h2>
            {displayMarkets.length === 0 && (
              <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                {t('No prices found for {{crop}} in the last 14 days.', { crop: data.crop })}
              </p>
            )}
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {displayMarkets.map((m) => {
                const isSmart = rec.smartPick?.market === m.market
                const isRising = (m.trendPct ?? 0) > 2
                const isFalling = (m.trendPct ?? 0) < -2
                const mapsUrl = googleMapsUrl(data.farmerDistrict, m.market, m.district)
                return (
                  <article key={`${m.market}-${m.district}`} className={`relative rounded-2xl border bg-white p-4 ${isSmart ? 'border-yellow-300 ring-2 ring-yellow-200' : 'border-slate-200'}`}>
                    {isSmart && (
                      <span className="absolute -top-2.5 left-4 flex items-center gap-1 rounded-full bg-yellow-400 px-2.5 py-0.5 text-xs font-bold text-yellow-900">
                        <Zap size={11} /> Smart Pick
                      </span>
                    )}

                    {/* Market name & location */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-slate-800">{m.market}</p>
                        <p className="flex items-center gap-1 text-xs text-slate-500"><MapPin size={11} />{m.district}</p>
                      </div>
                      {m.distanceKm != null && (
                        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                          {m.distanceKm} km
                        </span>
                      )}
                    </div>

                    {/* Price */}
                    <div className="mt-3 flex items-end gap-3">
                      <div>
                        <p className="text-xs text-slate-500">Modal price</p>
                        <p className="text-xl font-extrabold text-slate-900">{inr(m.modalPrice)}<span className="text-sm font-normal text-slate-500">/kg</span></p>
                        <p className="text-xs text-slate-400">{inr(m.minPrice)} – {inr(m.maxPrice)}</p>
                      </div>
                      <div className="ml-auto text-right">
                        <p className="text-xs text-slate-500">{days}-day trend</p>
                        <Sparkline points={m.trend} rising={isRising ? true : isFalling ? false : null} />
                        {m.trendPct != null && (
                          <p className={`flex items-center justify-end gap-0.5 text-xs font-semibold ${isRising ? 'text-green-600' : isFalling ? 'text-red-600' : 'text-slate-500'}`}>
                            {isRising ? <TrendingUp size={12} /> : isFalling ? <TrendingDown size={12} /> : <Minus size={12} />}
                            {m.trendPct > 0 ? '+' : ''}{m.trendPct}%
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Revenue estimate */}
                    {m.netRevenue != null && (
                      <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-xs">
                        <div><p className="text-slate-500">Gross revenue</p><p className="font-semibold">{inr(m.grossRevenue)}</p></div>
                        <div><p className="text-slate-500">Est. transport</p><p className="font-semibold">{m.transportCost != null ? inr(m.transportCost) : '—'}</p></div>
                        <div className="col-span-2 border-t border-slate-200 pt-2">
                          <p className="text-slate-500">Est. net revenue</p>
                          <p className="text-sm font-extrabold text-brand-700">{inr(m.netRevenue)}</p>
                        </div>
                      </div>
                    )}

                    {/* Date & Navigate button */}
                    <div className="mt-3 flex items-center justify-between">
                      <p className="text-xs text-slate-400">Price date: {fmtDate(m.date)}</p>
                      <a
                        href={mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                      >
                        <Navigation size={12} /> Navigate
                        <ExternalLink size={10} />
                      </a>
                    </div>
                  </article>
                )
              })}
            </div>
          </section>

          {/* How we calculate note */}
          <p className="text-xs text-slate-400">
            * Distance is estimated as road distance (straight line × 1.3) between district centres. Transport cost = ₹12/km × vehicles needed. Net revenue = gross − transport. These are estimates — confirm with actual transport quotes before travelling.
          </p>
        </div>
      )}
    </div>
  )
}
