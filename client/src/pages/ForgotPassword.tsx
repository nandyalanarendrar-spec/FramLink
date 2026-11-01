import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate } from 'react-router-dom'
import { CheckCircle2, KeyRound, Mail } from 'lucide-react'
import AuthShell from '../components/AuthShell'
import { api, errorMessage } from '../api/client'
import { landingPathFor, useAuth } from '../context/AuthContext'

// Forgot password: 1) enter your email, 2) enter the 6-digit code from your inbox and choose a new password
export default function ForgotPassword() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [step, setStep] = useState<'email' | 'code' | 'done'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [devCode, setDevCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  if (user) return <Navigate to={landingPathFor(user)} replace />

  async function sendCode(e?: FormEvent) {
    e?.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { data } = await api.post('/auth/forgot-password', { email: email.trim() })
      setDevCode(data.devOtp ?? '')
      setStep('code')
      setCooldown(60)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function reset(e: FormEvent) {
    e.preventDefault()
    if (password !== confirm) return setError(t('Passwords do not match'))
    setError('')
    setBusy(true)
    try {
      await api.post('/auth/reset-password', { email: email.trim(), code: code.trim(), newPassword: password })
      setStep('done')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (step === 'done') {
    return (
      <AuthShell>
        <CheckCircle2 size={40} className="text-brand-600" />
        <h1 className="mt-4 text-3xl font-bold text-slate-900">{t('Password changed')}</h1>
        <p className="mt-1 text-slate-500">{t('You were signed out everywhere. Log in with your new password.')}</p>
        <Link to="/login" className="btn-primary mt-8 w-full py-3 text-base">{t('Login')}</Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      <h1 className="text-3xl font-bold text-slate-900">{t('Forgot your password?')}</h1>
      <p className="mt-1 text-slate-500">
        {step === 'email' ? t('Enter the email you registered with. We will send you a 6-digit code.') : t('We sent a 6-digit code to {{email}} if it is registered. It expires in 15 minutes.', { email })}
      </p>

      {step === 'email' ? (
        <form onSubmit={sendCode} className="mt-8 space-y-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium">{t('Email')}</label>
            <div className="relative">
              <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className="input py-2.5 pl-10" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" required autoFocus />
            </div>
          </div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button className="btn-primary w-full py-3 text-base" disabled={busy}>{busy ? t('Sending…') : t('Send code')}</button>
        </form>
      ) : (
        <form onSubmit={reset} className="mt-8 space-y-5">
          {devCode && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{t('Dev mode: email sending is not configured on the server, so your code is {{code}}.', { code: devCode })}</p>}
          <div>
            <label className="mb-1.5 block text-sm font-medium">{t('6-digit code')}</label>
            <div className="relative">
              <KeyRound size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className="input py-2.5 pl-10 text-lg tracking-[0.4em]" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required autoFocus />
            </div>
          </div>
          <div><label className="mb-1.5 block text-sm font-medium">{t('New password')}</label><input className="input py-2.5" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          <div><label className="mb-1.5 block text-sm font-medium">{t('Confirm new password')}</label><input className="input py-2.5" type="password" autoComplete="new-password" minLength={8} required value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
          <p className="text-xs text-slate-500">{t('At least 8 characters with a letter and a number.')}</p>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button className="btn-primary w-full py-3 text-base" disabled={busy || code.length !== 6}>{busy ? t('Saving…') : t('Change password')}</button>
          <div className="flex items-center justify-between text-sm">
            <button type="button" className="font-semibold text-brand-700 hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline" disabled={cooldown > 0 || busy} onClick={() => sendCode()}>
              {cooldown > 0 ? t('Resend code in {{s}}s', { s: cooldown }) : t('Resend code')}
            </button>
            <button type="button" className="text-slate-500 hover:underline" onClick={() => { setStep('email'); setError('') }}>{t('Use a different email')}</button>
          </div>
        </form>
      )}

      <p className="mt-8 text-center text-sm text-slate-600">
        <Link to="/login" className="font-semibold text-brand-700 hover:underline">{t('Back to login')}</Link>
      </p>
    </AuthShell>
  )
}
