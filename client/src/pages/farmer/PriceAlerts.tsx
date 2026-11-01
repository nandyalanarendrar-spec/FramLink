import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Bell, Trash2 } from 'lucide-react'
import { api, errorMessage } from '../../api/client'
import { fmtDate, inr } from '../../api/crops'

interface Alert { _id: string; crop: string; direction: 'above' | 'below'; targetPrice: number; lastTriggeredAt?: string }

// "Tell me when tomato reaches ₹28/kg". Checked every time new market prices arrive.
export default function PriceAlerts({ crops }: { crops: string[] }) {
  const { t } = useTranslation()
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [crop, setCrop] = useState(crops[0] ?? '')
  const [direction, setDirection] = useState<'above' | 'below'>('above')
  const [target, setTarget] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(() => api.get('/alerts').then(({ data }) => setAlerts(data.alerts)).catch(() => {}), [])
  useEffect(() => { load() }, [load])
  useEffect(() => { if (!crop && crops[0]) setCrop(crops[0]) }, [crops, crop])

  async function add(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await api.post('/alerts', { crop, direction, targetPrice: target })
      setTarget('')
      await load()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    await api.delete(`/alerts/${id}`).catch(() => {})
    await load()
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="flex items-center gap-2 font-semibold"><Bell size={18} /> {t('Price alerts')}</h2>
      <p className="mt-1 text-sm text-slate-500">{t('Get a notification when a market price reaches your target. We check whenever new prices arrive.')}</p>

      <form onSubmit={add} className="mt-4 grid gap-3 sm:grid-cols-[1.4fr_1fr_1fr_auto]">
        <select className="input" value={crop} onChange={(e) => setCrop(e.target.value)} aria-label={t('Crop')}>{crops.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        <select className="input" value={direction} onChange={(e) => setDirection(e.target.value as 'above' | 'below')} aria-label={t('Direction')}>
          <option value="above">{t('Price goes above')}</option>
          <option value="below">{t('Price drops below')}</option>
        </select>
        <input className="input" type="number" min="0.5" step="any" required placeholder={t('Target (₹/kg)')} value={target} onChange={(e) => setTarget(e.target.value)} />
        <button className="btn-primary" disabled={busy || !crop}>{t('Set alert')}</button>
      </form>
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <ul className="mt-4 divide-y divide-slate-100">
        {alerts.length === 0 && <li className="py-3 text-sm text-slate-500">{t('No alerts yet.')}</li>}
        {alerts.map((a) => (
          <li key={a._id} className="flex items-center justify-between gap-3 py-3 text-sm">
            <span>
              <b>{a.crop}</b> {a.direction === 'above' ? t('at or above') : t('at or below')} <b>{inr(a.targetPrice)}{t('/kg')}</b>
              {a.lastTriggeredAt && <span className="block text-xs text-slate-400">{t('Last alert {{date}}', { date: fmtDate(a.lastTriggeredAt) })}</span>}
            </span>
            <button onClick={() => remove(a._id)} className="text-slate-400 hover:text-red-600" aria-label={t('Remove')}><Trash2 size={16} /></button>
          </li>
        ))}
      </ul>
    </section>
  )
}
