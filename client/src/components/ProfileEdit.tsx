import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { CheckCircle2, Pencil } from 'lucide-react'
import { api, errorMessage } from '../api/client'
import Stars from './Stars'
import type { Score } from './Stars'

function Notice({ error, ok }: { error: string; ok: string }) {
  return (
    <>
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {ok && <p className="mt-3 flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700"><CheckCircle2 size={16} /> {ok}</p>}
    </>
  )
}

// Name and phone. Email stays as it is (changing it would need a new OTP).
export function AccountEditor({ name, phone, onSaved }: { name: string; phone: string; onSaved: () => Promise<unknown> }) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [f, setF] = useState({ name, phone })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  async function save(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await api.put('/profile/account', f)
      await onSaved()
      setEditing(false)
      setOk(t('Saved.'))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (!editing) {
    return (
      <>
        <button className="btn-outline mt-4 gap-2" onClick={() => { setF({ name, phone }); setOk(''); setEditing(true) }}><Pencil size={15} /> {t('Edit name and mobile')}</button>
        <Notice error="" ok={ok} />
      </>
    )
  }
  return (
    <form onSubmit={save} className="mt-4 grid gap-3 sm:grid-cols-2">
      <div><label className="mb-1 block text-xs font-medium">{t('Name')}</label><input className="input" required minLength={2} maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
      <div><label className="mb-1 block text-xs font-medium">{t('Mobile')}</label><input className="input" required inputMode="numeric" maxLength={10} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value.replace(/\D/g, '') })} /></div>
      <div className="flex gap-2 sm:col-span-2"><button className="btn-primary" disabled={busy}>{busy ? t('Saving…') : t('Save changes')}</button><button type="button" className="btn-outline" onClick={() => setEditing(false)}>{t('Cancel')}</button></div>
      <div className="sm:col-span-2"><Notice error={error} ok="" /></div>
    </form>
  )
}


// Change the login email: enter the new address and your password, then the code we send to the NEW address
export function EmailChange({ onChanged }: { onChanged: () => Promise<unknown> }) {
  const { t } = useTranslation()
  const [step, setStep] = useState<'idle' | 'ask' | 'code'>('idle')
  const [f, setF] = useState({ newEmail: '', password: '' })
  const [code, setCode] = useState('')
  const [devCode, setDevCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  async function ask(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { data } = await api.post('/auth/email/request', { newEmail: f.newEmail.trim(), password: f.password })
      if (data.emailSent === false) {
        setError(t('We could not send the email right now. Try again in a minute.'))
        return
      }
      setDevCode(data.devOtp ?? '')
      setCode('')
      setStep('code')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function confirm(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await api.post('/auth/email/confirm', { code: code.trim() })
      await onChanged()
      setOk(t('Your email was changed. Use the new email to log in.'))
      setStep('idle')
      setF({ newEmail: '', password: '' })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (step === 'idle') {
    return (
      <>
        <button className="btn-outline mt-3 gap-2" onClick={() => { setOk(''); setError(''); setStep('ask') }}><Pencil size={15} /> {t('Change email')}</button>
        <Notice error="" ok={ok} />
      </>
    )
  }
  if (step === 'ask') {
    return (
      <form onSubmit={ask} className="mt-3 grid gap-3 sm:grid-cols-2">
        <div><label className="mb-1 block text-xs font-medium">{t('New email')}</label><input className="input" type="email" required value={f.newEmail} onChange={(e) => setF({ ...f, newEmail: e.target.value })} /></div>
        <div><label className="mb-1 block text-xs font-medium">{t('Current password')}</label><input className="input" type="password" autoComplete="current-password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
        <p className="text-xs text-slate-500 sm:col-span-2">{t('We will send a 6-digit code to the new email. Your email changes only after you enter it.')}</p>
        <div className="flex gap-2 sm:col-span-2"><button className="btn-primary" disabled={busy}>{busy ? t('Sending…') : t('Send code')}</button><button type="button" className="btn-outline" onClick={() => setStep('idle')}>{t('Cancel')}</button></div>
        <div className="sm:col-span-2"><Notice error={error} ok="" /></div>
      </form>
    )
  }
  return (
    <form onSubmit={confirm} className="mt-3 space-y-3">
      <p className="text-sm text-slate-600">{t('We sent a 6-digit code to {{email}}. It expires in 10 minutes.', { email: f.newEmail.trim().toLowerCase() })}</p>
      {devCode && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{t('Dev mode: email sending is not configured on the server, so your code is {{code}}.', { code: devCode })}</p>}
      <div className="max-w-xs"><label className="mb-1 block text-xs font-medium">{t('6-digit code')}</label><input className="input text-lg tracking-[0.4em]" inputMode="numeric" maxLength={6} required autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></div>
      <div className="flex flex-wrap gap-2"><button className="btn-primary" disabled={busy || code.length !== 6}>{busy ? t('Verifying…') : t('Confirm new email')}</button><button type="button" className="btn-outline" onClick={() => setStep('ask')}>{t('Back')}</button></div>
      <Notice error={error} ok="" />
    </form>
  )
}

const BUYER_TYPES = [['retailer', 'Retailer'], ['wholesaler', 'Wholesaler'], ['consumer', 'Consumer']]

// Everyday details that stay editable after verification (they do not prove identity)
export function BasicEditor({ role, values, onSaved }: { role: string; values: Record<string, string>; onSaved: () => Promise<unknown> }) {
  const { t } = useTranslation()
  const [f, setF] = useState<Record<string, string>>(values)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  useEffect(() => setF(values), [values])
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => { setOk(''); setF((x) => ({ ...x, [k]: e.target.value })) }

  if (role === 'transporter') {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="font-semibold">{t('Vehicle details you can change')}</h2>
        <p className="mt-1 text-sm text-slate-500">{t('Vehicle type, capacity, cost per km, areas served and availability can be changed any time.')}</p>
        <Link to="/transporter/vehicles" className="btn-outline mt-3">{t('Edit my vehicle')}</Link>
      </section>
    )
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const body = role === 'farmer'
        ? { farmSizeAcres: f.farmSizeAcres, farmAddress: f.farmAddress, district: f.district, village: f.village }
        : { buyerType: f.buyerType, businessName: f.businessName ?? '', businessAddress: f.businessAddress }
      await api.put('/profile/basic', body)
      await onSaved()
      setOk(t('Saved.'))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={save} className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="font-semibold">{t('Details you can change')}</h2>
      <p className="mt-1 text-sm text-slate-500">{t('These can be edited any time, even after verification.')}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {role === 'farmer' ? (
          <>
            <div><label className="mb-1 block text-sm font-medium">{t('Village')}</label><input className="input" required minLength={2} value={f.village ?? ''} onChange={set('village')} /></div>
            <div><label className="mb-1 block text-sm font-medium">{t('District')}</label><input className="input" required minLength={2} value={f.district ?? ''} onChange={set('district')} /></div>
            <div><label className="mb-1 block text-sm font-medium">{t('Farm size (acres)')}</label><input className="input" type="number" min="0.1" step="any" required value={f.farmSizeAcres ?? ''} onChange={set('farmSizeAcres')} /></div>
            <div className="sm:col-span-2"><label className="mb-1 block text-sm font-medium">{t('Farm address')}</label><textarea className="input min-h-20" required minLength={5} maxLength={200} value={f.farmAddress ?? ''} onChange={set('farmAddress')} /></div>
          </>
        ) : (
          <>
            <div>
              <label className="mb-1 block text-sm font-medium">{t('I am a')}</label>
              <select className="input" value={f.buyerType ?? ''} onChange={set('buyerType')} required>
                {BUYER_TYPES.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}
              </select>
            </div>
            <div><label className="mb-1 block text-sm font-medium">{t('Business / shop name')}</label><input className="input" maxLength={100} value={f.businessName ?? ''} onChange={set('businessName')} /></div>
            <div className="sm:col-span-2"><label className="mb-1 block text-sm font-medium">{t('Business / delivery address')}</label><textarea className="input min-h-20" required minLength={5} maxLength={200} value={f.businessAddress ?? ''} onChange={set('businessAddress')} /></div>
          </>
        )}
      </div>
      <Notice error={error} ok={ok} />
      <button className="btn-primary mt-4" disabled={busy}>{busy ? t('Saving…') : t('Save changes')}</button>
    </form>
  )
}

export function PasswordCard() {
  const { t } = useTranslation()
  const [f, setF] = useState({ currentPassword: '', newPassword: '', confirm: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  async function save(e: FormEvent) {
    e.preventDefault()
    setOk('')
    if (f.newPassword !== f.confirm) return setError(t('The two new passwords do not match.'))
    setError('')
    setBusy(true)
    try {
      await api.post('/auth/change-password', { currentPassword: f.currentPassword, newPassword: f.newPassword })
      setF({ currentPassword: '', newPassword: '', confirm: '' })
      setOk(t('Password changed.'))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={save} className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="font-semibold">{t('Change password')}</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div><label className="mb-1 block text-sm font-medium">{t('Current password')}</label><input className="input" type="password" autoComplete="current-password" required value={f.currentPassword} onChange={(e) => setF({ ...f, currentPassword: e.target.value })} /></div>
        <div><label className="mb-1 block text-sm font-medium">{t('New password')}</label><input className="input" type="password" autoComplete="new-password" required minLength={8} value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} /></div>
        <div><label className="mb-1 block text-sm font-medium">{t('Confirm new password')}</label><input className="input" type="password" autoComplete="new-password" required minLength={8} value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} /></div>
      </div>
      <p className="mt-2 text-xs text-slate-500">{t('At least 8 characters with a letter and a number.')}</p>
      <Notice error={error} ok={ok} />
      <button className="btn-primary mt-4" disabled={busy}>{busy ? t('Saving…') : t('Change password')}</button>
    </form>
  )
}

interface Recent { stars: number; comment?: string; fromRole: string; from?: string; at: string }

// What others think of me
export function MyRating() {
  const { t } = useTranslation()
  const [data, setData] = useState<{ rating: Score | null; recent: Recent[] } | null>(null)
  useEffect(() => { api.get('/ratings/me').then((r) => setData(r.data)).catch(() => setData(null)) }, [])
  if (!data) return null
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">{t('My rating')}</h2>
        <Stars rating={data.rating} className="text-sm" />
      </div>
      {data.recent.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">{t('You will see ratings and comments here after your first completed trade.')}</p>
      ) : (
        <ul className="mt-3 space-y-2 text-sm">
          {data.recent.map((r, i) => (
            <li key={i} className="rounded-lg bg-slate-50 px-3 py-2">
              <span className="font-semibold">{r.stars}★</span> <span className="text-slate-500">{t('from {{name}}', { name: r.from ?? t(r.fromRole) })}</span>
              {r.comment && <span className="text-slate-700"> · “{r.comment}”</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
