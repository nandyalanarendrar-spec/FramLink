import { useCallback, useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { api, errorMessage } from '../../api/client'
import { fmtDate, inr, statusMeta } from '../../api/crops'
import type { Crop, CropStatus } from '../../api/crops'

type Row = Crop & { farmer: { name: string; phone: string } }
const statuses: CropStatus[] = ['active', 'partially_sold', 'paused', 'draft', 'sold_out', 'expired', 'withdrawn']
const takedownable = ['active', 'partially_sold', 'paused', 'draft']

export default function Listings() {
  const [rows, setRows] = useState<Row[]>([])
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    try {
      const params: Record<string, string | number> = { page }
      if (q.trim()) params.q = q.trim()
      if (status) params.status = status
      const { data } = await api.get('/admin/listings', { params })
      setRows(data.listings)
      setPages(data.pages)
      setTotal(data.total)
      setError('')
    } catch (err) {
      setError(errorMessage(err))
    }
  }, [q, status, page])

  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [load])

  async function takeDown(l: Row) {
    const reason = window.prompt(`Take down "${l.crop}" by ${l.farmer.name}? Enter the reason (the farmer will see it):`)
    if (reason === null) return
    setError('')
    setNotice('')
    try {
      const { data } = await api.post(`/admin/listings/${l._id}/takedown`, { reason })
      setNotice(`Listing removed. ${data.closedRequests} open request(s) were closed and the buyers told.`)
      await load()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Listings</h1>
        <p className="text-sm text-slate-500">Every crop listing on FarmLink. Take down listings that break the rules; accepted orders are not affected.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Search by crop" value={q} onChange={(e) => { setPage(1); setQ(e.target.value) }} />
        </div>
        <select className="input" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value) }}>
          <option value="">All statuses</option>
          {statuses.map((s) => <option key={s} value={s}>{statusMeta[s].label}</option>)}
        </select>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {notice && <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{notice}</p>}
      <p className="text-sm text-slate-500">{total} listing(s)</p>

      <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="p-3">Crop</th><th className="p-3">Farmer</th><th className="p-3">Stock / price</th><th className="p-3">Listed</th><th className="p-3">Status</th><th className="p-3" /></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-slate-500">No listings match.</td></tr>}
            {rows.map((l) => (
              <tr key={l._id} className="border-b border-slate-100 last:border-0">
                <td className="p-3"><div className="flex items-center gap-3">{l.images?.[0] ? <img src={l.images[0]} alt="" className="h-10 w-10 rounded-lg object-cover" /> : <span className="h-10 w-10 rounded-lg bg-slate-100" />}<span><p className="font-semibold">{l.crop}</p><p className="text-xs capitalize text-slate-500">{l.category} · Grade {l.grade}</p></span></div></td>
                <td className="p-3"><p>{l.farmer.name}</p><p className="text-xs capitalize text-slate-500">{l.village}, {l.district}</p></td>
                <td className="p-3">{l.availableQty.toLocaleString('en-IN')} / {l.quantity.toLocaleString('en-IN')} kg<p className="text-xs text-slate-500">{inr(l.expectedPrice)}/kg</p></td>
                <td className="p-3 text-xs text-slate-500">{fmtDate(l.createdAt)}</td>
                <td className="p-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusMeta[l.status].cls}`}>{statusMeta[l.status].label}</span></td>
                <td className="p-3 text-right">{takedownable.includes(l.status) && <button onClick={() => takeDown(l)} className="rounded-lg border border-red-200 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">Take down</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <button className="btn-outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
          <span>Page {page} of {pages}</span>
          <button className="btn-outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}
    </div>
  )
}
