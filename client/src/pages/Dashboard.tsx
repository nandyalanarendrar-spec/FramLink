import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Clock, XCircle } from 'lucide-react'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { T } from '../i18n'
import BuyerDashboard from './dashboards/BuyerDashboard'
import TransporterDashboard from './dashboards/TransporterDashboard'
import AdminDashboard from './dashboards/AdminDashboard'

const unlocks: Record<string, string> = {
  farmer: T('add crop listings or accept orders'),
  buyer: T('send purchase requests'),
  transporter: T('accept transport requests'),
}

function VerificationBanner() {
  const { t } = useTranslation()
  const { user } = useAuth()
  if (!user || user.role === 'admin' || user.verificationStatus === 'verified') return null

  const profile = `/${user.role}/profile`
  const rejected = user.verificationStatus === 'rejected'
  const underReview = !rejected && user.detailsSubmitted

  const tone = rejected ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-800'
  const Icon = rejected ? XCircle : underReview ? Clock : AlertTriangle
  const what = t(unlocks[user.role])

  return (
    <div className={`flex gap-3 rounded-xl border p-4 text-sm ${tone}`}>
      <Icon className="mt-0.5 shrink-0" size={18} />
      <div className="flex-1">
        {rejected ? (
          <>
            <p className="font-semibold">{t('Your verification was rejected.')}</p>
            <p>{t('Reason: {{reason}}. Update your details and submit again.', { reason: user.rejectionReason || t('not specified') })}</p>
          </>
        ) : underReview ? (
          <>
            <p className="font-semibold">{t('Pending admin verification')}</p>
            <p>{t('An admin is reviewing your details. Once verified, you can {{what}}.', { what })}</p>
          </>
        ) : (
          <>
            <p className="font-semibold">{t('Complete your verification')}</p>
            <p>{t('Submit your verification details. You can {{what}} only after an admin verifies you.', { what })}</p>
          </>
        )}
      </div>
      {!underReview && (
        <Link to={profile} className="btn-primary shrink-0 self-center">{rejected ? t('Update details') : t('Submit details')}</Link>
      )}
    </div>
  )
}

export default function Dashboard() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [live, setLive] = useState<number>()
  const [openRequests, setOpenRequests] = useState<number>()
  const [transportN, setTransportN] = useState<number>()
  const [sales, setSales] = useState<number>()
  const verifiedFarmer = user?.role === 'farmer' && user.verificationStatus === 'verified'

  useEffect(() => {
    if (!verifiedFarmer) return
    api.get('/crops/mine').then(({ data }) => setLive((data.counts.active ?? 0) + (data.counts.partially_sold ?? 0))).catch(() => {})
    api.get('/requests/mine').then(({ data }) => setOpenRequests(data.counts.open)).catch(() => {})
    api.get('/transport/mine').then(({ data }) => setTransportN(data.counts.active)).catch(() => {})
    api.get('/orders/summary').then(({ data }) => setSales(data.value)).catch(() => {})
  }, [verifiedFarmer])

  if (!user) return null

  const farmerStats = [
    { label: T('Active listings'), value: live ?? 0 },
    { label: T('Open buyer requests'), value: openRequests ?? 0 },
    { label: T('Active transport requests'), value: transportN ?? 0 },
    { label: T('Completed sales'), value: `₹${(sales ?? 0).toLocaleString('en-IN')}` },
  ]
  const roleName = t({ farmer: T('Farmer'), buyer: T('Buyer'), transporter: T('Transporter'), admin: T('Admin') }[user.role])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('Welcome, {{name}}', { name: user.name })}</h1>
        <p className="flex items-center gap-1 text-sm text-slate-500">
          {t('{{role}} dashboard', { role: roleName })}
          {user.role !== 'admin' && user.verificationStatus === 'verified' && (
            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700">
              <CheckCircle2 size={12} /> {t('Verified')}
            </span>
          )}
        </p>
      </div>

      <VerificationBanner />

      {user.role === 'farmer' ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {farmerStats.map((s) => (
            <div key={s.label} className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-3xl font-bold text-brand-700">{s.value}</p>
              <p className="mt-1 text-sm text-slate-500">{t(s.label)}</p>
            </div>
          ))}
        </div>
      ) : user.role === 'buyer' ? (
        <BuyerDashboard />
      ) : user.role === 'transporter' ? (
        <TransporterDashboard />
      ) : (
        <AdminDashboard />
      )}
    </div>
  )
}
