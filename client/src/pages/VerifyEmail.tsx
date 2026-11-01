import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate } from 'react-router-dom'
import { MailCheck } from 'lucide-react'
import AuthShell from '../components/AuthShell'
import { errorMessage } from '../api/client'
import { homePathFor, useAuth } from '../context/AuthContext'

const COOLDOWN = 60

export default function VerifyEmail() {
  const { t } = useTranslation()
  const { user, loading, devOtp, mailFailed, verifyEmail, resendOtp, logout } = useAuth()
  const navigate = useNavigate()
  const [otp, setOtp] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)
  const [cooldown, setCooldown] = useState(COOLDOWN)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  if (user.emailVerified) return <Navigate to={homePathFor(user.role)} replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const u = await verifyEmail(otp)
      navigate(homePathFor(u.role), { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function onResend() {
    setError('')
    setInfo('')
    try {
      await resendOtp()
      setCooldown(COOLDOWN)
      setInfo(t('A new code has been sent.'))
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <AuthShell>
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-100 text-brand-700"><MailCheck size={28} /></span>
      <h1 className="mt-5 text-3xl font-bold text-slate-900">{t('Verify your email')}</h1>
      <p className="mt-1 text-slate-500">{t('We sent a 6-digit code to {{email}}. It expires in 10 minutes.', { email: user.email })}</p>

      {mailFailed && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{t('We could not send the email right now. Wait a minute and tap “Resend code”.')}</p>
      )}

      {devOtp && (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {t('Dev mode: email sending is not configured on the server, so your code is {{code}}.', { code: devOtp })}
        </p>
      )}

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <input
          className="input py-3 text-center text-2xl font-bold tracking-[0.5em]"
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          placeholder="••••••"
          autoFocus
          required
        />
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {info && <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{info}</p>}
        <button className="btn-primary w-full py-3 text-base" disabled={busy || otp.length !== 6}>{busy ? t('Verifying…') : t('Verify email')}</button>
      </form>

      <div className="mt-6 flex items-center justify-between text-sm">
        <button onClick={onResend} disabled={cooldown > 0} className="font-semibold text-brand-700 hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline">
          {cooldown > 0 ? t('Resend code in {{s}}s', { s: cooldown }) : t('Resend code')}
        </button>
        <button onClick={() => logout().then(() => navigate('/login'))} className="text-slate-500 hover:underline">{t('Use a different account')}</button>
      </div>
    </AuthShell>
  )
}
