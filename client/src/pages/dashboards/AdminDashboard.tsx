import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { LineChart, ShieldCheck } from 'lucide-react'
import { api } from '../../api/client'
import { fmtDate } from '../../api/crops'
import StatCard from '../../components/StatCard'
import MailCard from '../../components/MailCard'

interface Row { role: string; status: string; count: number }
interface PriceStatus { total: number; newestDate: string | null; agmarknetConfigured: boolean }

const roles = ['farmer', 'buyer', 'transporter']

export default function AdminDashboard() {
  const { t } = useTranslation()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [prices, setPrices] = useState<PriceStatus | null>(null)
  const [openReports, setOpenReports] = useState(0)

  useEffect(() => {
    Promise.all([api.get('/admin/stats'), api.get('/admin/prices/status')])
      .then(([s, p]) => { setRows(s.data.rows); setOpenReports(s.data.openReports ?? 0); setPrices(p.data) })
      .catch(() => setRows([]))
  }, [])

  if (!rows) return <p className="text-slate-500">{t('Loading…')}</p>

  const count = (role: string | null, status: string) => rows.filter((r) => (role ? r.role === role : true) && r.status === status).reduce((a, r) => a + r.count, 0)
  const pending = count(null, 'pending')

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t('Waiting for verification')} value={pending} tone={pending ? 'warn' : 'default'} to="/admin/verifications" />
        <StatCard label={t('Verified accounts')} value={count(null, 'verified')} />
        <StatCard label={t('Open reports')} value={openReports} tone={openReports ? 'warn' : 'default'} to="/admin/reports" />
        <StatCard label={t('Market price rows')} value={prices?.total ?? 0} sub={prices?.newestDate ? t('Newest {{date}}', { date: fmtDate(prices.newestDate) }) : undefined} to="/admin/prices" />
      </div>

      <MailCard />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold"><ShieldCheck size={18} /> {t('Verification queue')}</h2>
            <Link to="/admin/verifications" className="text-xs font-semibold text-brand-700 hover:underline">{t('Manage')}</Link>
          </div>
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
              <tr><th className="py-1">{t('Role')}</th><th>{t('Pending')}</th><th>{t('Verified')}</th><th>{t('Rejected')}</th></tr>
            </thead>
            <tbody>
              {roles.map((r) => (
                <tr key={r} className="border-t border-slate-100">
                  <td className="py-2 font-medium">{t(r)}</td>
                  <td className={count(r, 'pending') ? 'font-bold text-amber-600' : ''}>{count(r, 'pending')}</td>
                  <td>{count(r, 'verified')}</td>
                  <td>{count(r, 'rejected')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold"><LineChart size={18} /> {t('Market prices')}</h2>
            <Link to="/admin/prices" className="text-xs font-semibold text-brand-700 hover:underline">{t('Manage')}</Link>
          </div>
          <p className="mt-3 text-sm text-slate-600">
            {prices?.agmarknetConfigured ? t('AGMARKNET auto-import is on (daily 9:00 AM and 6:00 PM IST).') : t('AGMARKNET is not configured. Add prices manually or set DATA_GOV_API_KEY.')}
          </p>
          <p className="mt-2 text-xs text-slate-500">{t('Farmers compare markets using these prices, so keep them fresh.')}</p>
        </section>
      </div>
    </div>
  )
}
