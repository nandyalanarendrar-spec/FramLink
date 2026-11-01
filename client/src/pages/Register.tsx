import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { ShoppingBasket, Sprout, Truck } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import AuthShell from '../components/AuthShell'
import { errorMessage } from '../api/client'
import { landingPathFor, useAuth } from '../context/AuthContext'
import { T } from '../i18n'
import type { RegisterInput } from '../context/AuthContext'

type SelfRole = RegisterInput['role']
const roles: { value: SelfRole; label: string; hint: string; icon: LucideIcon }[] = [
  { value: 'farmer', label: T('Farmer'), hint: T('Sell my crops'), icon: Sprout },
  { value: 'buyer', label: T('Buyer'), hint: T('Buy produce'), icon: ShoppingBasket },
  { value: 'transporter', label: T('Transporter'), hint: T('Deliver goods'), icon: Truck },
]

const empty = {
  name: '', phone: '', email: '', password: '', confirm: '',
  district: '', village: '',
  buyerType: 'retailer', businessName: '',
  vehicleType: '', vehicleNumber: '', vehicleCapacityKg: '',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      {children}
    </div>
  )
}

export default function Register() {
  const { t } = useTranslation()
  const { user, register } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const q = params.get('role')
  const initialRole = roles.find((r) => r.value === q)?.value ?? 'farmer'

  const [role, setRole] = useState<SelfRole>(initialRole)
  const [form, setForm] = useState(empty)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to={landingPathFor(user)} replace />

  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (form.password !== form.confirm) return setError(t('Passwords do not match'))
    setBusy(true)
    try {
      const base = { name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim(), password: form.password, role }
      const extra =
        role === 'farmer'
          ? { district: form.district.trim(), village: form.village.trim() }
          : role === 'buyer'
            ? { buyerType: form.buyerType as RegisterInput['buyerType'], businessName: form.businessName.trim() || undefined }
            : { vehicleType: form.vehicleType.trim(), vehicleNumber: form.vehicleNumber.trim(), vehicleCapacityKg: Number(form.vehicleCapacityKg) }
      const u = await register({ ...base, ...extra })
      navigate(landingPathFor(u), { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell wide>
      <h1 className="text-3xl font-bold text-slate-900">{t('Create your account')}</h1>
      <p className="mt-1 text-slate-500">{t("Join FarmLink in a minute. We'll verify your email next.")}</p>

      <div className="mt-6 grid grid-cols-3 gap-3">
        {roles.map(({ value, label, hint, icon: Icon }) => (
          <button
            type="button"
            key={value}
            onClick={() => setRole(value)}
            className={`rounded-xl border-2 p-3 text-center transition ${
              role === value ? 'border-brand-600 bg-brand-50' : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <Icon className={`mx-auto ${role === value ? 'text-brand-600' : 'text-slate-400'}`} size={22} />
            <p className="mt-1 text-sm font-semibold">{t(label)}</p>
            <p className="text-xs text-slate-500">{t(hint)}</p>
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <Field label={t('Full name')}><input className="input" value={form.name} onChange={set('name')} required minLength={2} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('Mobile number')}><input className="input" value={form.phone} onChange={set('phone')} inputMode="numeric" maxLength={10} placeholder={t('10 digits')} required /></Field>
          <Field label={t('Email')}><input className="input" type="email" value={form.email} onChange={set('email')} placeholder="you@email.com" required /></Field>
        </div>

        {role === 'farmer' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('District')}><input className="input" value={form.district} onChange={set('district')} required /></Field>
            <Field label={t('Village')}><input className="input" value={form.village} onChange={set('village')} required /></Field>
          </div>
        )}

        {role === 'buyer' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('I am a')}>
              <select className="input" value={form.buyerType} onChange={set('buyerType')}>
                <option value="retailer">{t('Retailer')}</option>
                <option value="wholesaler">{t('Wholesaler')}</option>
                <option value="consumer">{t('Consumer')}</option>
              </select>
            </Field>
            <Field label={t('Business name (optional)')}><input className="input" value={form.businessName} onChange={set('businessName')} /></Field>
          </div>
        )}

        {role === 'transporter' && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t('Vehicle type')}><input className="input" value={form.vehicleType} onChange={set('vehicleType')} placeholder="Mini truck" required /></Field>
            <Field label={t('Vehicle number')}><input className="input" value={form.vehicleNumber} onChange={set('vehicleNumber')} placeholder="AP02AB1234" required /></Field>
            <Field label={t('Capacity (kg)')}><input className="input" type="number" min={1} value={form.vehicleCapacityKg} onChange={set('vehicleCapacityKg')} required /></Field>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('Password')}><input className="input" type="password" value={form.password} onChange={set('password')} minLength={8} required /></Field>
          <Field label={t('Confirm password')}><input className="input" type="password" value={form.confirm} onChange={set('confirm')} required /></Field>
        </div>
        <p className="text-xs text-slate-500">{t('Password: minimum 8 characters.')}</p>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button className="btn-primary w-full py-3 text-base" disabled={busy}>{busy ? t('Creating account…') : t('Register')}</button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-600">
        {t('Already registered?')} <Link to="/login" className="font-semibold text-brand-700 hover:underline">{t('Login')}</Link>
      </p>
    </AuthShell>
  )
}
