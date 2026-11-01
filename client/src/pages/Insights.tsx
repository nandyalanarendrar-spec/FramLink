import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BarChart3, Info } from 'lucide-react'
import { api, errorMessage } from '../api/client'
import { inr } from '../api/crops'
import { T } from '../i18n'

interface Row {
  crop: string
  demandKg: number
  supplyKg: number
  requests: number
  listings: number
  avgAskPrice: number | null
  avgOfferPrice: number | null
  status: 'high_demand' | 'balanced' | 'surplus' | 'no_stock' | 'no_demand'
}

const statusMeta: Record<Row['status'], { label: string; cls: string; hint: string }> = {
  high_demand: { label: T('High demand'), cls: 'bg-red-100 text-red-700', hint: T('Buyers want more than farmers have listed') },
  no_stock: { label: T('No stock'), cls: 'bg-red-100 text-red-700', hint: T('Buyers asked, nobody has it listed') },
  balanced: { label: T('Balanced'), cls: 'bg-brand-100 text-brand-700', hint: T('Demand and supply are close') },
  surplus: { label: T('Surplus'), cls: 'bg-amber-100 text-amber-700', hint: T('More listed than buyers are asking for') },
  no_demand: { label: T('No requests yet'), cls: 'bg-slate-100 text-slate-600', hint: T('Listed, but nobody has asked in 30 days') },
}

// Shared by farmers and buyers: what is wanted and what is on offer, on FarmLink only
export default function Insights() {
  const { t } = useTranslation()
  const [crops, setCrops] = useState<Row[] | null>(null)
  const [districts, setDistricts] = useState<{ district: string; requests: number }[]>([])
  const [days, setDays] = useState(30)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/analytics/demand-supply')
      .then(({ data }) => { setCrops(data.crops); setDistricts(data.districts); setDays(data.windowDays) })
      .catch((err) => setError(errorMessage(err)))
  }, [])

  if (!crops) return <p className="text-slate-500">{error || t('Loading…')}</p>
  const max = Math.max(...crops.flatMap((c) => [c.demandKg, c.supplyKg]), 1)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">{t('Demand & Supply')}</h1>
        <p className="text-sm text-slate-500">{t('What buyers asked for in the last {{n}} days versus what farmers have for sale now.', { n: days })}</p>
      </div>

      <p className="flex gap-2 rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800"><Info size={18} className="mt-0.5 shrink-0" />{t('This shows FarmLink activity only, not the whole market. Use it as one more signal when deciding what to grow or sell.')}</p>

      {crops.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <BarChart3 className="mx-auto text-slate-400" size={32} />
          <p className="mt-2 font-semibold">{t('Nothing to compare yet')}</p>
          <p className="text-sm text-slate-500">{t('Numbers appear once farmers list crops and buyers send requests.')}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {crops.map((c) => (
            <li key={c.crop} className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-bold">{c.crop}</h2>
                <span title={t(statusMeta[c.status].hint)} className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusMeta[c.status].cls}`}>{t(statusMeta[c.status].label)}</span>
              </div>
              <div className="mt-3 space-y-2 text-sm">
                <div>
                  <div className="flex justify-between"><span>{t('Demand')}</span><span className="text-slate-500">{t('{{n}} kg', { n: c.demandKg.toLocaleString('en-IN') })} · {t('{{n}} request(s)', { n: c.requests })}</span></div>
                  <div className="mt-1 h-2.5 rounded-full bg-slate-100"><div className="h-2.5 rounded-full bg-blue-500" style={{ width: `${(c.demandKg / max) * 100}%` }} /></div>
                </div>
                <div>
                  <div className="flex justify-between"><span>{t('Supply')}</span><span className="text-slate-500">{t('{{n}} kg', { n: c.supplyKg.toLocaleString('en-IN') })} · {t('{{n}} listing(s)', { n: c.listings })}</span></div>
                  <div className="mt-1 h-2.5 rounded-full bg-slate-100"><div className="h-2.5 rounded-full bg-brand-500" style={{ width: `${(c.supplyKg / max) * 100}%` }} /></div>
                </div>
              </div>
              {(c.avgAskPrice != null || c.avgOfferPrice != null) && (
                <p className="mt-3 text-xs text-slate-500">
                  {c.avgAskPrice != null && <>{t('Farmers ask about {{p}}/kg', { p: inr(c.avgAskPrice) })}</>}
                  {c.avgAskPrice != null && c.avgOfferPrice != null && ' · '}
                  {c.avgOfferPrice != null && <>{t('Buyers offer about {{p}}/kg', { p: inr(c.avgOfferPrice) })}</>}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {districts.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold">{t('Most requested locations')}</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {districts.map((d) => <li key={d.district} className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"><span className="capitalize">{d.district}</span><span className="font-semibold">{t('{{n}} request(s)', { n: d.requests })}</span></li>)}
          </ul>
        </section>
      )}
    </div>
  )
}
