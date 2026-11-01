import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Flag } from 'lucide-react'
import { api, errorMessage } from '../api/client'
import { T } from '../i18n'

interface Report { _id: string; targetType: string; status: 'open' | 'resolved' | 'dismissed'; adminNote?: string }

const categories: Record<'order' | 'listing', { value: string; label: string }[]> = {
  order: [
    { value: 'wrong_quantity', label: T('Wrong quantity') },
    { value: 'quality_issue', label: T('Quality problem') },
    { value: 'payment_issue', label: T('Payment problem') },
    { value: 'no_show', label: T('The other person did not show up') },
    { value: 'abusive_behaviour', label: T('Abusive behaviour') },
    { value: 'other', label: T('Something else') },
  ],
  listing: [
    { value: 'fake_listing', label: T('Fake or misleading listing') },
    { value: 'abusive_behaviour', label: T('Abusive behaviour') },
    { value: 'other', label: T('Something else') },
  ],
}

// "Report a problem" with an order or a listing. Admins review it and reply with a note.
export default function ReportButton({ targetType, targetId }: { targetType: 'order' | 'listing'; targetId: string }) {
  const { t } = useTranslation()
  const [reports, setReports] = useState<Report[]>([])
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState(categories[targetType][0].value)
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = () => api.get('/reports/mine', { params: { targetId } }).then(({ data }) => setReports(data.reports.filter((r: Report) => r.targetType === targetType))).catch(() => {})
  useEffect(() => { load() }, [targetId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await api.post('/reports', { targetType, targetId, category, ...(details.trim() && { details: details.trim() }) })
      setOpen(false)
      setDetails('')
      await load()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const openReport = reports.find((r) => r.status === 'open')
  const closed = reports.find((r) => r.status !== 'open')

  return (
    <div className="text-sm">
      {openReport ? (
        <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-amber-800"><CheckCircle2 size={16} /> {t('Report sent. An admin will review it and reply here.')}</p>
      ) : (
        <>
          {closed && <p className="mb-2 rounded-lg bg-slate-50 px-3 py-2 text-slate-600">{t('Your last report was reviewed: {{note}}', { note: closed.adminNote ?? '' })}</p>}
          {!open && <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 text-slate-500 hover:text-red-600"><Flag size={15} /> {t('Report a problem')}</button>}
        </>
      )}

      {open && !openReport && (
        <form onSubmit={submit} className="mt-2 space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <div>
            <label className="mb-1 block text-xs font-medium">{t('What is the problem?')}</label>
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories[targetType].map((c) => <option key={c.value} value={c.value}>{t(c.label)}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">{t('Details (optional)')}</label>
            <textarea className="input min-h-20" maxLength={500} value={details} onChange={(e) => setDetails(e.target.value)} />
          </div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>}
          <div className="flex gap-2">
            <button className="btn-primary" disabled={busy}>{busy ? t('Sending…') : t('Send report')}</button>
            <button type="button" className="btn-outline" onClick={() => setOpen(false)}>{t('Cancel')}</button>
          </div>
        </form>
      )}
    </div>
  )
}
