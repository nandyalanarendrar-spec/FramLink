import { useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Lock, User } from 'lucide-react'
import AuthShell from '../components/AuthShell'
import { errorMessage } from '../api/client'
import { landingPathFor, useAuth } from '../context/AuthContext'

export default function Login() {
  const { t } = useTranslation()
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to={landingPathFor(user)} replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const u = await login(identifier.trim(), password)
      navigate(landingPathFor(u), { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell>
      <h1 className="text-3xl font-bold text-slate-900">{t('Welcome back 👋')}</h1>
      <p className="mt-1 text-slate-500">{t('Login to continue to your FarmLink account.')}</p>

      <form onSubmit={onSubmit} className="mt-8 space-y-5">
        <div>
          <label className="mb-1.5 block text-sm font-medium">{t('Mobile number or email')}</label>
          <div className="relative">
            <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input py-2.5 pl-10" value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="9876543210 or you@email.com" required autoFocus />
          </div>
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="block text-sm font-medium">{t('Password')}</label>
            <Link to="/forgot-password" className="text-sm font-semibold text-brand-700 hover:underline">{t('Forgot password?')}</Link>
          </div>
          <div className="relative">
            <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input py-2.5 pl-10 pr-10" type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('Your password')} required />
            <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" aria-label={show ? t('Hide password') : t('Show password')}>
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button className="btn-primary w-full py-3 text-base" disabled={busy}>{busy ? t('Logging in…') : t('Login')}</button>
      </form>

      <p className="mt-8 text-center text-sm text-slate-600">
        {t('New to FarmLink?')} <Link to="/register" className="font-semibold text-brand-700 hover:underline">{t('Create an account')}</Link>
      </p>
    </AuthShell>
  )
}
