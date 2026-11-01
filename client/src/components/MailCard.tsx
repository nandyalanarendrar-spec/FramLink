import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Mail, TriangleAlert } from 'lucide-react'
import { api, errorMessage } from '../api/client'

// Admin: is email delivery set up, and does it really work? Sends a test email to the admin's own address.
export default function MailCard() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<{ provider: 'brevo-api' | 'smtp' | null; from: string | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => { api.get('/admin/mail').then((r) => setStatus(r.data)).catch(() => setStatus(null)) }, [])
  if (!status) return null

  async function test() {
    setBusy(true)
    setResult(null)
    try {
      const { data } = await api.post('/admin/mail/test')
      setResult({ ok: true, text: data.message })
    } catch (err) {
      setResult({ ok: false, text: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  const label = status.provider === 'brevo-api' ? 'Brevo (API)' : status.provider === 'smtp' ? 'SMTP' : null
  return (
    <section className={`rounded-2xl border p-5 ${status.provider ? 'border-slate-200 bg-white' : 'border-amber-200 bg-amber-50'}`}>
      <h2 className="flex items-center gap-2 font-semibold"><Mail size={18} /> {t('Email delivery')}</h2>
      {status.provider ? (
        <>
          <p className="mt-2 text-sm text-slate-600">{t('Sending through {{provider}} from {{from}}.', { provider: label, from: status.from })}</p>
          <button className="btn-outline mt-3" disabled={busy} onClick={test}>{busy ? t('Sending…') : t('Send me a test email')}</button>
        </>
      ) : (
        <p className="mt-2 flex items-start gap-2 text-sm text-amber-900">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          {t('Email is not set up. Sign-up codes and password resets cannot reach people yet. Add your Brevo or SMTP settings to server/.env.')}
        </p>
      )}
      {result && (
        <p className={`mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${result.ok ? 'bg-brand-50 text-brand-800' : 'bg-red-50 text-red-700'}`}>
          {result.ok && <CheckCircle2 size={16} className="mt-0.5 shrink-0" />} {result.text}
        </p>
      )}
    </section>
  )
}
