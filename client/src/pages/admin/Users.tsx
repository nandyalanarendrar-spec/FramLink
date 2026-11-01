import { useCallback, useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { api, errorMessage } from '../../api/client'
import { fmtDate } from '../../api/crops'

interface Row {
  _id: string
  name: string
  phone: string
  email: string
  role: string
  isActive: boolean
  emailVerified: boolean
  verificationStatus: 'pending' | 'verified' | 'rejected'
  createdAt: string
  documentCount: number
}

const statusCls = { pending: 'bg-amber-100 text-amber-700', verified: 'bg-brand-100 text-brand-700', rejected: 'bg-red-100 text-red-700' }

export default function Users() {
  const [rows, setRows] = useState<Row[]>([])
  const [q, setQ] = useState('')
  const [role, setRole] = useState('')
  const [status, setStatus] = useState('')
  const [active, setActive] = useState('')
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const params: Record<string, string | number> = { page }
      if (q.trim()) params.q = q.trim()
      if (role) params.role = role
      if (status) params.status = status
      if (active) params.active = active
      const { data } = await api.get('/admin/accounts', { params })
      setRows(data.users)
      setPages(data.pages)
      setTotal(data.total)
      setError('')
    } catch (err) {
      setError(errorMessage(err))
    }
  }, [q, role, status, active, page])

  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [load])

  async function toggle(u: Row) {
    const next = !u.isActive
    if (!window.confirm(next ? `Switch ${u.name} back on?` : `Switch off ${u.name}? They will be logged out and cannot log in.`)) return
    try {
      await api.patch(`/admin/accounts/${u._id}/active`, { isActive: next })
      await load()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const reset = <T,>(fn: (v: T) => void) => (v: T) => { setPage(1); fn(v) }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Users</h1>
        <p className="text-sm text-slate-500">All accounts. Switching an account off logs the person out and blocks login until you switch it back on.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative lg:col-span-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Name, phone or email" value={q} onChange={(e) => reset(setQ)(e.target.value)} />
        </div>
        <select className="input" value={role} onChange={(e) => reset(setRole)(e.target.value)}><option value="">All roles</option><option value="farmer">Farmers</option><option value="buyer">Buyers</option><option value="transporter">Transporters</option></select>
        <select className="input" value={status} onChange={(e) => reset(setStatus)(e.target.value)}><option value="">Any verification</option><option value="pending">Pending</option><option value="verified">Verified</option><option value="rejected">Rejected</option></select>
        <select className="input" value={active} onChange={(e) => reset(setActive)(e.target.value)}><option value="">Active and switched off</option><option value="true">Active only</option><option value="false">Switched off only</option></select>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <p className="text-sm text-slate-500">{total} account(s)</p>

      <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="p-3">Name</th><th className="p-3">Contact</th><th className="p-3">Verification</th><th className="p-3">Joined</th><th className="p-3">Account</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-slate-500">No accounts match.</td></tr>}
            {rows.map((u) => (
              <tr key={u._id} className="border-b border-slate-100 last:border-0">
                <td className="p-3"><p className="font-semibold">{u.name}</p><p className="text-xs capitalize text-slate-500">{u.role}{u.documentCount ? ` · ${u.documentCount} document(s)` : ''}</p></td>
                <td className="p-3"><p>{u.phone}</p><p className="break-all text-xs text-slate-500">{u.email}</p></td>
                <td className="p-3">{u.role === 'admin' ? <span className="text-xs text-slate-400">Admin</span> : <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${statusCls[u.verificationStatus]}`}>{u.verificationStatus}</span>}</td>
                <td className="p-3 text-xs text-slate-500">{fmtDate(u.createdAt)}</td>
                <td className="p-3">
                  {u.role === 'admin' ? <span className="text-xs text-slate-400">Protected</span> : (
                    <button onClick={() => toggle(u)} className={`rounded-lg border px-3 py-1 text-xs font-semibold ${u.isActive ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-brand-200 text-brand-700 hover:bg-brand-50'}`}>{u.isActive ? 'Switch off' : 'Switch on'}</button>
                  )}
                </td>
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
