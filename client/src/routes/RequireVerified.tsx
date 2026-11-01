import { useTranslation } from 'react-i18next'
import { Link, Outlet } from 'react-router-dom'
import { Clock, ShieldAlert, XCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

// Wraps every feature page: nothing beyond Dashboard / Profile / Notifications
// is usable until an admin has verified the account.
export default function RequireVerified() {
  const { t } = useTranslation()
  const { user } = useAuth()
  if (!user || user.verificationStatus === 'verified') return <Outlet />

  const profile = `/${user.role}/profile`
  const rejected = user.verificationStatus === 'rejected'
  const underReview = !rejected && user.detailsSubmitted

  const Icon = rejected ? XCircle : underReview ? Clock : ShieldAlert
  const tone = rejected ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'
  const title = rejected ? t('Verification rejected') : underReview ? t('Verification under review') : t('Verification required')
  const text = rejected
    ? t('Reason: {{reason}}. Update your details and submit again.', { reason: user.rejectionReason || t('not specified') })
    : underReview
      ? t('An admin is reviewing your details. This page unlocks as soon as you are verified.')
      : t('Submit your verification details first. This page unlocks after an admin verifies your account.')

  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-10 text-center">
      <span className={`mx-auto grid h-14 w-14 place-items-center rounded-2xl ${tone}`}><Icon size={28} /></span>
      <h1 className="mt-4 text-xl font-bold">{title}</h1>
      <p className="mt-2 text-sm text-slate-600">{text}</p>
      {underReview ? (
        <Link to={profile} className="btn-outline mt-5">{t('View my submission')}</Link>
      ) : (
        <Link to={profile} className="btn-primary mt-5">{rejected ? t('Update details') : t('Go to verification details')}</Link>
      )}
    </div>
  )
}
