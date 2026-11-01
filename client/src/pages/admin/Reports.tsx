import { useCallback, useEffect, useState } from 'react'
import { api, errorMessage } from '../../api/client'
import { fmtDate } from '../../api/crops'

interface Person { name: string; phone: string; role: string; isActive?: boolean }
interface Row {
  _id: string
  targetType: 'order' | 'listing'
  summary: string
  category: string
  details?: string
  status: 'open' | 'resolved' | 'dismissed'
  adminNote?: string
  createdAt: string
  reporter?: Person
  reported?: Person
}

const tabs = ['open', 'resolved', 'dismissed'] as const

export default function Reports() {
  const [status, setStatus] = useState<(typeof tabs)[number]>('open')
  const [rows, setRows] = useState<Row[]>([])
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/reports', { params: { status } })
      setRows(data.reports)
      setError('')
    } catch (err) {
      setError(errorMessage(err))
    }
  }, [status])
  useEffect(() => { load() }, [load])

  async function close(r: Row, to: 'resolved' | 'dismissed') {
    const note = window.prompt(`${to === 'resolved' ? 'Resolve' : 'Dismiss'} this report. Write a short note the reporter will see:`)
    if (note === null) return
    try {
      await api.patch(`/admin/reports/${r._id}`, { status: to, note })
      await load()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const tab = (a: boolean) => `rounded-lg px-3 py-1.5 text-sm font-semibold capitalize ${a ? 'bg-brand-600 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-sm text-slate-500">Complaints from farmers and buyers about orders and listings. Review, then resolve or dismiss with a note. To act on a person or listing use the Users and Listings pages.</p>
      </div>
      <div className="flex gap-2">{tabs.map((s) => <button key={s} className={tab(status === s)} onClick={() => setStatus(s)}>{s}</button>)}</div>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">No {status} reports.</div>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r._id} className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{r.summary} <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium capitalize text-slate-600">{r.targetType}</span></p>
                  <p className="text-sm capitalize text-amber-700">{r.category.replace(/_/g, ' ')}</p>
                </div>
                <p className="text-xs text-slate-400">{fmtDate(r.createdAt)}</p>
              </div>
              {r.details && <p className="mt-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">“{r.details}”</p>}
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div><dt className="text-slate-500">Reported by</dt><dd className="font-medium">{r.reporter?.name} <span className="font-normal capitalize text-slate-500">({r.reporter?.role}) {r.reporter?.phone}</span></dd></div>
                <div><dt className="text-slate-500">About</dt><dd className="font-medium">{r.reported?.name} <span className="font-normal capitalize text-slate-500">({r.reported?.role}) {r.reported?.phone}</span>{r.reported?.isActive === false && <span className="ml-2 text-xs font-semibold text-red-600">switched off</span>}</dd></div>
              </dl>
              {r.status === 'open' ? (
                <div className="mt-4 flex gap-2">
                  <button className="btn-primary" onClick={() => close(r, 'resolved')}>Resolve</button>
                  <button className="btn-outline" onClick={() => close(r, 'dismissed')}>Dismiss</button>
                </div>
              ) : <p className="mt-3 text-sm text-slate-600"><b className="capitalize">{r.status}:</b> {r.adminNote}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
