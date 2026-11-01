import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { CheckCircle2, Lock, Truck } from 'lucide-react'
import { api, errorMessage } from '../../api/client'

interface Details {
  vehicleNumber?: string
  vehicleType?: string
  vehicleCapacityKg?: number
  licenceNumber?: string
  isAvailable?: boolean
  ratePerKm?: number
  serviceArea?: string
}

export default function Vehicle() {
  const { t } = useTranslation()
  const [d, setD] = useState<Details | null>(null)
  const [verified, setVerified] = useState(false)
  const [type, setType] = useState('')
  const [capacity, setCapacity] = useState('')
  const [available, setAvailable] = useState(true)
  const [rate, setRate] = useState('')
  const [area, setArea] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/profile')
      .then(({ data }) => {
        setD(data.details)
        setVerified(data.verification.status === 'verified')
        setType(data.details.vehicleType ?? '')
        setCapacity(String(data.details.vehicleCapacityKg ?? ''))
        setAvailable(data.details.isAvailable !== false)
        setRate(data.details.ratePerKm ? String(data.details.ratePerKm) : '')
        setArea(data.details.serviceArea ?? '')
      })
      .catch((err) => setError(errorMessage(err)))
  }, [])

  async function save(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSaved(false)
    setBusy(true)
    try {
      const { data } = await api.put('/profile/vehicle', { vehicleType: type.trim(), vehicleCapacityKg: Number(capacity), isAvailable: available, ratePerKm: rate ? Number(rate) : null, serviceArea: area.trim() || null })
      setD(data.details)
      setSaved(true)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (!d) return <p className="text-slate-500">{error || t('Loading…')}</p>

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">{t('My Vehicle')}</h1>
        <p className="text-sm text-slate-500">{t('Keep your vehicle details and availability up to date so you only see jobs you can do.')}</p>
      </div>

      <section className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5">
        <span className="grid h-14 w-14 place-items-center rounded-xl bg-brand-100 text-brand-700"><Truck size={28} /></span>
        <div className="flex-1">
          <p className="text-xs uppercase tracking-wide text-slate-400">{t('Number plate')}</p>
          <p className="text-xl font-bold tracking-wider">{d.vehicleNumber}</p>
          <p className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500"><Lock size={12} /> {verified ? t('Locked after verification') : t('Edit the plate and licence in My Profile before verification.')}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${available ? 'bg-brand-100 text-brand-700' : 'bg-slate-200 text-slate-600'}`}>{available ? t('Available for jobs') : t('Not taking jobs')}</span>
      </section>

      <form onSubmit={save} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="mb-1 block text-sm font-medium">{t('Vehicle type')}</label><input className="input" required minLength={2} value={type} onChange={(e) => { setSaved(false); setType(e.target.value) }} /></div>
          <div><label className="mb-1 block text-sm font-medium">{t('Load capacity (kg)')}</label><input className="input" type="number" min="1" required value={capacity} onChange={(e) => { setSaved(false); setCapacity(e.target.value) }} />
            <p className="mt-1 text-xs text-slate-500">{t('You only see jobs up to this weight.')}</p></div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="mb-1 block text-sm font-medium">{t('Your usual cost per km (₹)')}</label><input className="input" type="number" min="1" step="any" value={rate} onChange={(e) => { setSaved(false); setRate(e.target.value) }} />
            <p className="mt-1 text-xs text-slate-500">{t('Shown to farmers and buyers on the vehicle list.')}</p></div>
          <div><label className="mb-1 block text-sm font-medium">{t('Areas you serve')}</label><input className="input" maxLength={80} placeholder={t('e.g. Anantapur, Kurnool')} value={area} onChange={(e) => { setSaved(false); setArea(e.target.value) }} /></div>
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-slate-50 p-4">
          <input type="checkbox" className="mt-1 h-4 w-4 accent-brand-600" checked={available} onChange={(e) => { setSaved(false); setAvailable(e.target.checked) }} />
          <span>
            <span className="block text-sm font-semibold">{t('I am available for new jobs')}</span>
            <span className="block text-xs text-slate-500">{t('Turn this off when your vehicle is busy. You will not see or get alerts for new jobs.')}</span>
          </span>
        </label>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {saved && <p className="flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700"><CheckCircle2 size={16} /> {t('Saved.')}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-primary" disabled={busy}>{busy ? t('Saving…') : t('Save changes')}</button>
          <Link to="/transporter/profile" className="btn-outline">{t('My Profile')}</Link>
        </div>
      </form>
    </div>
  )
}
