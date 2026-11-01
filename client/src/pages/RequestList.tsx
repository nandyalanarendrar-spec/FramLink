import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Inbox } from 'lucide-react'
import { api, errorMessage } from '../api/client'
import { inr } from '../api/crops'
import { requestStatusMeta } from '../api/requests'
import type { PurchaseRequest, RequestCounts } from '../api/requests'
import { useAuth } from '../context/AuthContext'
import { T } from '../i18n'

type Tab = 'open' | 'accepted' | 'closed'
const tabs: { value: Tab; label: string }[] = [
  { value: 'open', label: T('Open') },
  { value: 'accepted', label: T('Accepted') },
  { value: 'closed', label: T('Closed') },
]

// Shared by "Buyer Requests" (farmer) and "My Requests" (buyer)
export default function RequestList() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const role = user?.role === 'farmer' ? 'farmer' : 'buyer'
  const [tab, setTab] = useState<Tab>('open')
  const [items, setItems] = useState<PurchaseRequest[]>([])
  const [counts, setCounts] = useState<RequestCounts>({ open: 0, accepted: 0, closed: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    api.get('/requests/mine', { params: { tab } })
      .then(({ data }) => { setItems(data.requests); setCounts(data.counts) })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false))
  }, [tab])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">{role === 'farmer' ? t('Buyer Requests') : t('My Requests')}</h1>
        <p className="text-sm text-slate-500">
          {role === 'farmer' ? t('Purchase requests from buyers. Accept, counter or decline.') : t('Your purchase requests and negotiations.')}
        </p>
      </div>

      <div className="flex gap-2">
        {tabs.map((tb) => (
          <button
            key={tb.value}
            onClick={() => setTab(tb.value)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${tab === tb.value ? 'bg-brand-600 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            {t(tb.label)} <span className="opacity-70">({counts[tb.value]})</span>
          </button>
        ))}
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {loading ? (
        <p className="text-slate-500">{t('Loading…')}</p>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <Inbox className="mx-auto text-slate-400" size={32} />
          <p className="mt-2 font-semibold">{t('No {{tab}} requests', { tab: t(tabs.find((x) => x.value === tab)!.label).toLowerCase() })}</p>
          {role === 'buyer' && tab === 'open' && <Link to="/buyer/marketplace" className="btn-primary mt-4">{t('Browse marketplace')}</Link>}
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((r) => (
            <li key={r._id}>
              <Link to={`/${role}/requests/${r._id}`} className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 transition hover:shadow-md">
                <div className="min-w-40 flex-1">
                  <p className="font-bold">{r.crop}</p>
                  <p className="text-sm text-slate-500">{role === 'farmer' ? t('From') : t('To')} {r.counterpart.name}{r.counterpart.detail ? ` · ${r.counterpart.detail}` : ''}</p>
                </div>
                <div className="text-sm">
                  <p className="font-semibold">{r.quantity.toLocaleString('en-IN')} kg × {inr(r.price)}</p>
                  <p className="text-slate-500">{t('Total {{n}}', { n: inr(r.quantity * r.price) })}</p>
                </div>
                <div className="flex items-center gap-2">
                  {r.myTurn && <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">{t('Your reply')}</span>}
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${requestStatusMeta[r.status].cls}`}>{t(requestStatusMeta[r.status].label)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
