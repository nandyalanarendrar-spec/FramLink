import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Star } from 'lucide-react'
import { api, errorMessage } from '../api/client'

interface Target {
  role: 'farmer' | 'buyer' | 'transporter'
  name: string
  given: { stars: number; comment?: string } | null
}

// Rate the other people on a delivered order (farmer, buyer, transporter). Each person can be rated once per order.
export default function RatingBox({ orderId }: { orderId: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [targets, setTargets] = useState<Target[]>([])
  const [draft, setDraft] = useState<Record<string, { stars: number; comment: string }>>({})
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/ratings/order/${orderId}`)
      setOpen(data.open)
      setTargets(data.targets)
    } catch {
      setOpen(false)
    }
  }, [orderId])

  useEffect(() => { load() }, [load])

  async function submit(role: string) {
    const d = draft[role]
    if (!d?.stars) return setError(t('Choose 1 to 5 stars first.'))
    setError('')
    setBusy(role)
    try {
      await api.post('/ratings', { orderId, target: role, stars: d.stars, ...(d.comment?.trim() && { comment: d.comment.trim() }) })
      await load()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy('')
    }
  }

  if (!open || targets.length === 0) return null
  const roleLabel: Record<string, string> = { farmer: t('Farmer'), buyer: t('Buyer'), transporter: t('Transporter') }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="font-semibold">{t('Rate this trade')}</h2>
      <p className="text-sm text-slate-500">{t('Your rating helps others choose who to trade with.')}</p>
      <ul className="mt-4 space-y-4">
        {targets.map((x) => (
          <li key={x.role} className="rounded-xl bg-slate-50 p-4">
            <p className="text-sm font-semibold">{roleLabel[x.role]}: {x.name}</p>
            {x.given ? (
              <p className="mt-1 inline-flex items-center gap-1 text-sm text-slate-600">
                {t('You rated')} {x.given.stars} <Star size={14} className="fill-amber-400 text-amber-400" />
                {x.given.comment && <span> · “{x.given.comment}”</span>}
              </p>
            ) : (
              <>
                <div className="mt-2 flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" aria-label={t('{{n}} stars', { n })} onClick={() => setDraft((d) => ({ ...d, [x.role]: { stars: n, comment: d[x.role]?.comment ?? '' } }))}>
                      <Star size={24} className={n <= (draft[x.role]?.stars ?? 0) ? 'fill-amber-400 text-amber-400' : 'text-slate-300'} />
                    </button>
                  ))}
                </div>
                <input className="input mt-2 bg-white" maxLength={300} placeholder={t('Comment (optional)')} value={draft[x.role]?.comment ?? ''} onChange={(e) => setDraft((d) => ({ ...d, [x.role]: { stars: d[x.role]?.stars ?? 0, comment: e.target.value } }))} />
                <button type="button" className="btn-primary mt-2" disabled={busy === x.role} onClick={() => submit(x.role)}>{t('Submit rating')}</button>
              </>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </section>
  )
}
