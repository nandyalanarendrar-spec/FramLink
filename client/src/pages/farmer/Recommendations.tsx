import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BellRing, Check, Users } from 'lucide-react'
import { api, errorMessage } from '../../api/client'

interface Suggestion {
  buyerId: string
  name: string
  buyerType?: string
  businessName?: string
  score: number
  reasons: string[]
  notified: boolean
}

// Suggested buyers for one live listing. No contact details: the farmer can only nudge the buyer.
export default function Recommendations({ listingId }: { listingId: string }) {
  const { t } = useTranslation()
  const [items, setItems] = useState<Suggestion[] | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    api.get(`/crops/${listingId}/recommendations`)
      .then(({ data }) => setItems(data.buyers))
      .catch((err) => setError(errorMessage(err)))
  }, [listingId])

  async function notifyBuyer(b: Suggestion) {
    setBusy(b.buyerId)
    setError('')
    try {
      await api.post(`/crops/${listingId}/recommendations/${b.buyerId}/notify`)
      setItems((list) => list?.map((x) => (x.buyerId === b.buyerId ? { ...x, notified: true } : x)) ?? null)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="mt-4 rounded-xl bg-slate-50 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold"><Users size={16} /> {t('Suggested buyers')}</p>
      <p className="text-xs text-slate-500">{t('Ranked from past orders and requests for this crop. You can send a heads-up; contact details stay private.')}</p>
      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      {!items && !error && <p className="mt-2 text-sm text-slate-500">{t('Loading…')}</p>}
      {items?.length === 0 && <p className="mt-2 text-sm text-slate-500">{t('No matching buyers yet. They appear as buyers order or ask for this crop.')}</p>}
      <ul className="mt-3 space-y-3">
        {items?.map((b) => (
          <li key={b.buyerId} className="rounded-lg bg-white p-3 text-sm shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-semibold">{b.name}{b.businessName ? <span className="font-normal text-slate-500"> · {b.businessName}</span> : null}</p>
                <p className="text-xs capitalize text-slate-500">{b.buyerType ? t(b.buyerType === 'retailer' ? 'Retailer' : b.buyerType === 'wholesaler' ? 'Wholesaler' : 'Consumer') : ''}</p>
              </div>
              <span className="rounded-full bg-brand-100 px-2.5 py-1 text-xs font-bold text-brand-700" title={t('Match score out of 100')}>{b.score}%</span>
            </div>
            <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs text-slate-600">{b.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
            <button className="btn-outline mt-3 gap-1.5 py-1.5 text-xs" disabled={b.notified || busy === b.buyerId} onClick={() => notifyBuyer(b)}>
              {b.notified ? <><Check size={14} /> {t('Buyer told today')}</> : <><BellRing size={14} /> {t('Tell this buyer')}</>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
