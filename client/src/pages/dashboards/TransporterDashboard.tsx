import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { MapPin } from 'lucide-react'
import { api } from '../../api/client'
import { fmtDate, inr } from '../../api/crops'
import { transportStatusMeta } from '../../api/orders'
import type { Transport } from '../../api/orders'
import StatCard from '../../components/StatCard'
import { useAuth } from '../../context/AuthContext'

interface Data {
  available: number
  capacityKg: number
  trips: Transport[]
  counts: { active: number; history: number }
  summary: { trips: number; amount: number; kg: number }
}

export default function TransporterDashboard() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [d, setD] = useState<Data | null>(null)
  const verified = user?.verificationStatus === 'verified'

  useEffect(() => {
    if (!verified) return
    Promise.all([api.get('/transport/available'), api.get('/transport/mine', { params: { tab: 'active' } })])
      .then(([av, mine]) => setD({ available: av.data.transports.length, capacityKg: av.data.capacityKg, trips: mine.data.transports, counts: mine.data.counts, summary: mine.data.summary }))
      .catch(() => {})
  }, [verified])

  if (!verified) return null
  if (!d) return <p className="text-slate-500">{t('Loading…')}</p>

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t('Available jobs')} value={d.available} sub={t('Up to {{n}} kg', { n: d.capacityKg.toLocaleString('en-IN') })} to="/transporter/requests" />
        <StatCard label={t('My active trips')} value={d.counts.active} to="/transporter/requests" />
        <StatCard label={t('Trips delivered')} value={d.summary.trips} sub={t('{{n}} kg', { n: d.summary.kg.toLocaleString('en-IN') })} />
        <StatCard label={t('Total earned')} value={inr(d.summary.amount)} />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{t('My active trips')}</h2>
          <Link to="/transporter/requests" className="text-xs font-semibold text-brand-700 hover:underline">{t('View all')}</Link>
        </div>
        <ul className="mt-3 divide-y divide-slate-100">
          {d.trips.length === 0 && <li className="py-4 text-sm text-slate-500">{t('No active trips. Check the available jobs.')}</li>}
          {d.trips.slice(0, 4).map((tr) => (
            <li key={tr._id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span>
                <span className="block font-medium">{tr.crop} · {t('{{n}} kg', { n: tr.weightKg.toLocaleString('en-IN') })} · {inr(tr.charge)}</span>
                <span className="flex items-center gap-1 text-xs text-slate-500"><MapPin size={12} />{tr.pickupAddress} → {tr.dropAddress} · {fmtDate(tr.pickupDate)}</span>
              </span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${transportStatusMeta[tr.status].cls}`}>{t(transportStatusMeta[tr.status].label)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
