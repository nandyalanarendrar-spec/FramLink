import { Link } from 'react-router-dom'

// Number tile used on the dashboards. Clickable when `to` is given.
export default function StatCard({ label, value, sub, to, tone = 'default' }: { label: string; value: string | number; sub?: string; to?: string; tone?: 'default' | 'warn' }) {
  const body = (
    <>
      <p className={`text-3xl font-bold ${tone === 'warn' ? 'text-amber-600' : 'text-brand-700'}`}>{value}</p>
      <p className="mt-1 text-sm text-slate-500">{label}</p>
      {sub && <p className={`mt-1 text-xs font-semibold ${tone === 'warn' ? 'text-amber-600' : 'text-slate-400'}`}>{sub}</p>}
    </>
  )
  const cls = 'block rounded-xl border border-slate-200 bg-white p-5'
  return to ? <Link to={to} className={`${cls} transition hover:-translate-y-0.5 hover:shadow-md`}>{body}</Link> : <div className={cls}>{body}</div>
}
