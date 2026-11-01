import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Clock, FileText, Lock, ShieldAlert, Trash2, Upload, XCircle } from 'lucide-react'
import { api, errorMessage } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { T } from '../i18n'
import { AccountEditor, BasicEditor, EmailChange, MyRating, PasswordCard } from '../components/ProfileEdit'

type Values = Record<string, string>

const idTypes = [
  { value: 'farmer_id', label: T('Farmer registry ID') },
  { value: 'voter_id', label: T('Voter ID') },
  { value: 'pan', label: T('PAN') },
  { value: 'driving_licence', label: T('Driving licence') },
]

interface FieldDef {
  key: string
  label: string
  type?: 'text' | 'number' | 'select' | 'textarea'
  options?: { value: string; label: string }[]
  placeholder?: string
  hint?: string
  required?: boolean
  upper?: boolean
}

const idFields: FieldDef[] = [
  { key: 'idType', label: T('ID proof type'), type: 'select', options: idTypes, required: true },
  { key: 'idNumber', label: T('ID number'), placeholder: T('As printed on your ID'), required: true, upper: true, hint: T('We never ask for your Aadhaar number.') },
]

const fieldsByRole: Record<string, FieldDef[]> = {
  farmer: [
    ...idFields,
    { key: 'farmSizeAcres', label: T('Farm size (acres)'), type: 'number', placeholder: '3.5', required: true },
    { key: 'landSurveyNumber', label: T('Land survey number'), placeholder: '12/A', hint: T('Optional') },
    { key: 'farmAddress', label: T('Farm address'), type: 'textarea', placeholder: T('Survey no., village, mandal'), required: true },
  ],
  buyer: [
    { key: 'buyerType', label: T('I am a'), type: 'select', options: [{ value: 'retailer', label: T('Retailer') }, { value: 'wholesaler', label: T('Wholesaler') }, { value: 'consumer', label: T('Consumer') }], required: true },
    { key: 'businessName', label: T('Business / shop name'), hint: T('Optional for consumers') },
    ...idFields,
    { key: 'gstNumber', label: T('GST number'), placeholder: '37ABCDE1234F1Z5', upper: true, hint: T('Optional. 15 characters.') },
    { key: 'businessAddress', label: T('Business / delivery address'), type: 'textarea', required: true },
  ],
  transporter: [
    { key: 'vehicleNumber', label: T('Vehicle number plate'), placeholder: 'AP02AB1234', required: true, upper: true, hint: T('Exactly as on the number plate.') },
    { key: 'vehicleType', label: T('Vehicle type'), placeholder: 'Mini truck', required: true },
    { key: 'vehicleCapacityKg', label: T('Load capacity (kg)'), type: 'number', required: true },
    { key: 'licenceNumber', label: T('Driving licence number'), required: true, upper: true },
  ],
}

const statusUi = {
  pending: { icon: Clock, cls: 'border-amber-200 bg-amber-50 text-amber-800' },
  verified: { icon: CheckCircle2, cls: 'border-brand-100 bg-brand-50 text-brand-800' },
  rejected: { icon: XCircle, cls: 'border-red-200 bg-red-50 text-red-800' },
} as const

type Status = keyof typeof statusUi

export default function Profile() {
  const { t } = useTranslation()
  const { user, refresh } = useAuth()
  const [account, setAccount] = useState<{ name: string; phone: string; email: string; emailVerified: boolean } | null>(null)
  const [verification, setVerification] = useState<{ status: Status; rejectionReason?: string; submittedAt?: string } | null>(null)
  const [form, setForm] = useState<Values>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [docs, setDocs] = useState<{ id: string; name: string; mime: string }[]>([])
  const [docBusy, setDocBusy] = useState(false)

  const role = user?.role ?? 'farmer'
  const fields = fieldsByRole[role] ?? []

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/profile')
      setAccount(data.account)
      setVerification(data.verification)
      setDocs(data.documents ?? [])
      const v: Values = {}
      for (const [k, val] of Object.entries(data.details)) if (val != null) v[k] = String(val)
      setForm(v)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const locked = verification?.status === 'verified'
  const docsLocked = locked && docs.length > 0 // verified before documents existed: allow adding one
  const set = (k: string, upper?: boolean) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setSaved(false)
    setForm((f) => ({ ...f, [k]: upper ? e.target.value.toUpperCase() : e.target.value }))
  }

  async function onDocs(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!picked.length) return
    if (picked.some((f) => f.size > 3 * 1024 * 1024)) return setError(t('Each file must be under 3 MB.'))
    setError('')
    setDocBusy(true)
    try {
      const fd = new FormData()
      picked.forEach((f) => fd.append('files', f))
      const { data } = await api.post('/profile/documents', fd)
      setDocs(data.documents)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setDocBusy(false)
    }
  }

  async function removeDoc(id: string) {
    setDocBusy(true)
    try {
      const { data } = await api.delete(`/profile/documents/${id}`)
      setDocs(data.documents)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setDocBusy(false)
    }
  }

  async function unlock() {
    setError('')
    setBusy(true)
    try {
      await api.post('/profile/unlock')
      await Promise.all([load(), refresh()])
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSaved(false)
    setBusy(true)
    try {
      const payload: Values = {}
      for (const f of fields) if (form[f.key]?.trim()) payload[f.key] = form[f.key].trim()
      await api.put('/profile/verification', payload)
      await Promise.all([load(), refresh()])
      setSaved(true)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <p className="text-slate-500">{t('Loading…')}</p>
  if (!account || !verification) return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error || t('Could not load profile')}</p>

  const submitted = Boolean(verification.submittedAt)
  const ui = statusUi[verification.status]
  const StatusIcon = !submitted && verification.status === 'pending' ? ShieldAlert : ui.icon
  const heading =
    verification.status === 'pending' ? (submitted ? t('Pending review') : t('Details not submitted')) : verification.status === 'verified' ? t('Verified') : t('Rejected')
  const message =
    verification.status === 'verified'
      ? t('Your account is verified. You can use all FarmLink features.')
      : verification.status === 'rejected'
        ? t('Rejected: {{reason}}. Fix the details below and submit again.', { reason: verification.rejectionReason || t('no reason given') })
        : submitted
          ? t('Submitted. An admin is reviewing your details. You can use all features once verified.')
          : t('Submit the details below. An admin must verify them before you can use crops, orders and other features.')
  const roleName = t(({ farmer: T('Farmer'), buyer: T('Buyer'), transporter: T('Transporter'), admin: T('Admin') } as Record<string, string>)[role])

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('My Profile')}</h1>
        <p className="text-sm text-slate-500">{t('Your account and verification details.')}</p>
      </div>

      <section className={`flex gap-3 rounded-xl border p-4 text-sm ${ui.cls}`}>
        <StatusIcon className="mt-0.5 shrink-0" size={18} />
        <div>
          <p className="font-semibold">{heading}</p>
          <p>{message}</p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="font-semibold">{t('Account')}</h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-slate-500">{t('Name')}</dt><dd className="font-medium">{account.name}</dd></div>
          <div><dt className="text-slate-500">{t('Role')}</dt><dd className="font-medium">{roleName}</dd></div>
          <div><dt className="text-slate-500">{t('Mobile')}</dt><dd className="font-medium">{account.phone}</dd></div>
          <div>
            <dt className="text-slate-500">{t('Email')}</dt>
            <dd className="font-medium">
              {account.email}
              {account.emailVerified && <span className="ml-2 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700">{t('Verified')}</span>}
            </dd>
          </div>
        </dl>
        <AccountEditor name={account.name} phone={account.phone} onSaved={() => Promise.all([load(), refresh()])} />
        <EmailChange onChanged={() => Promise.all([load(), refresh()])} />
      </section>

      {locked && <BasicEditor role={role} values={form} onSaved={load} />}

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="font-semibold">{t('ID proof document')} <span className="text-red-500">*</span></h2>
        <p className="mt-1 text-sm text-slate-500">{t('Upload a clear photo or PDF of the ID you selected below. Only you and FarmLink admins can open it.')}</p>
        <ul className="mt-3 space-y-2">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <FileText size={18} className="shrink-0 text-slate-400" />
              <a href={`/api/files/docs/${d.id}`} target="_blank" rel="noreferrer" className="flex-1 truncate font-medium text-brand-700 hover:underline">{d.name}</a>
              {!docsLocked && <button type="button" disabled={docBusy} onClick={() => removeDoc(d.id)} className="text-slate-400 hover:text-red-600" aria-label={t('Remove')}><Trash2 size={16} /></button>}
            </li>
          ))}
          {docs.length === 0 && <li className="text-sm text-amber-700">{t('No document uploaded yet.')}</li>}
        </ul>
        {!docsLocked && docs.length < 5 && (
          <label className="btn-outline mt-3 cursor-pointer gap-2">
            <Upload size={16} /> {docBusy ? t('Uploading…') : t('Upload photo or PDF')}
            <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple className="hidden" onChange={onDocs} disabled={docBusy} />
          </label>
        )}
      </section>

      <form onSubmit={onSubmit} className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">{t('Verification details')}</h2>
          {locked && <span className="inline-flex items-center gap-1 text-xs text-slate-500"><Lock size={14} /> {t('Locked after verification')}</span>}
        </div>

        <fieldset disabled={locked || busy} className="mt-4 grid gap-4 sm:grid-cols-2">
          {fields.map((f) => (
            <div key={f.key} className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>
              <label className="mb-1 block text-sm font-medium">{t(f.label)}{f.required && <span className="text-red-500"> *</span>}</label>
              {f.type === 'select' ? (
                <select className="input" value={form[f.key] ?? ''} onChange={set(f.key)} required={f.required}>
                  <option value="" disabled>{t('Select…')}</option>
                  {f.options?.map((o) => <option key={o.value} value={o.value}>{t(o.label)}</option>)}
                </select>
              ) : f.type === 'textarea' ? (
                <textarea className="input min-h-20" value={form[f.key] ?? ''} onChange={set(f.key)} placeholder={f.placeholder ? t(f.placeholder) : undefined} required={f.required} maxLength={200} />
              ) : (
                <input className="input" type={f.type === 'number' ? 'number' : 'text'} step="any" min={f.type === 'number' ? 0 : undefined} value={form[f.key] ?? ''} onChange={set(f.key, f.upper)} placeholder={f.placeholder ? t(f.placeholder) : undefined} required={f.required} />
              )}
              {f.hint && <p className="mt-1 text-xs text-slate-500">{t(f.hint)}</p>}
            </div>
          ))}
        </fieldset>

        {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {saved && <p className="mt-4 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{t('Submitted for admin review.')}</p>}

        {!locked && (
          <button className="btn-primary mt-5" disabled={busy}>
            {busy ? t('Submitting…') : submitted ? t('Update and resubmit') : t('Submit for verification')}
          </button>
        )}
        {locked && (
          <div className="mt-5 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
            <p>{t('ID details are locked so nobody can swap identities. If something is wrong, you can edit them, but an admin must verify you again before you can trade.')}</p>
            <button type="button" className="btn-outline mt-2" disabled={busy} onClick={() => window.confirm(t('Edit your ID details? Your account will go back to pending until an admin verifies it again.')) && unlock()}>{t('Edit ID details (needs re-verification)')}</button>
          </div>
        )}
        <p className="mt-3 text-xs text-slate-500">{t('Your details are visible only to you and FarmLink admins.')}</p>
      </form>

      <MyRating />
      <PasswordCard />
    </div>
  )
}
