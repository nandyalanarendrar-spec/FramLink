import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ImagePlus, X } from 'lucide-react'
import { api, errorMessage } from '../../api/client'
import { categories, fmtDate, inr, toInputDate } from '../../api/crops'
import { sourceLabel } from '../../api/prices'
import type { PriceReference } from '../../api/prices'
import type { Crop } from '../../api/crops'
import { useAuth } from '../../context/AuthContext'
import VoiceFill from '../../components/VoiceFill'
import type { VoiceResult } from '../../utils/voice'

const empty = {
  crop: '', category: 'vegetable', quantity: '', expectedPrice: '', minOrderQty: '', grade: 'A',
  harvestDate: '', availableFrom: '', deadline: '', district: '', village: '', description: '',
}
type Form = typeof empty

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

export default function CropForm() {
  const { t } = useTranslation()
  const { id } = useParams()
  const editing = Boolean(id)
  const navigate = useNavigate()
  const { user } = useAuth()
  const verified = user?.verificationStatus === 'verified'

  const [form, setForm] = useState<Form>(empty)
  const [status, setStatus] = useState<Crop['status']>('draft')
  const [loading, setLoading] = useState(editing)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const today = new Date().toISOString().slice(0, 10)
  const [reference, setReference] = useState<PriceReference | null>(null)
  const [images, setImages] = useState<string[]>([]) // photos already saved on the listing
  const [staged, setStaged] = useState<File[]>([]) // photos chosen while creating a new listing
  const [photoBusy, setPhotoBusy] = useState(false)
  const previews = useMemo(() => staged.map((f) => URL.createObjectURL(f)), [staged])
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews])

  // Reference range from real market prices, shown next to the price field
  useEffect(() => {
    const name = form.crop.trim()
    if (name.length < 3) { setReference(null); return }
    const timer = setTimeout(() => {
      api.get('/prices/suggest', { params: { crop: name } }).then(({ data }) => setReference(data.reference)).catch(() => setReference(null))
    }, 400)
    return () => clearTimeout(timer)
  }, [form.crop])

  useEffect(() => {
    if (!id) return
    api.get(`/crops/${id}`)
      .then(({ data }) => {
        const c: Crop = data.listing
        setStatus(c.status)
        setImages(c.images ?? [])
        setForm({
          crop: c.crop, category: c.category, quantity: String(c.quantity), expectedPrice: String(c.expectedPrice),
          minOrderQty: c.minOrderQty ? String(c.minOrderQty) : '', grade: c.grade,
          harvestDate: toInputDate(c.harvestDate), availableFrom: toInputDate(c.availableFrom), deadline: toInputDate(c.deadline),
          district: c.district, village: c.village, description: c.description ?? '',
        })
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false))
  }, [id])

  // Speech fills only what it understood, the rest of the form is left alone
  const applyVoice = (v: VoiceResult) =>
    setForm((f) => ({
      ...f,
      ...(v.crop && { crop: v.crop }),
      ...(v.category && { category: v.category }),
      ...(v.quantity && { quantity: String(v.quantity) }),
      ...(v.price && { expectedPrice: String(v.price) }),
    }))

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  async function save(publish: boolean) {
    setError('')
    setBusy(true)
    try {
      // empty optional fields are omitted so the server applies its defaults
      const payload: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(form)) if (v !== '') payload[k] = v

      if (editing) {
        await api.put(`/crops/${id}`, payload)
        if (publish) await api.patch(`/crops/${id}/status`, { status: 'active' })
      } else {
        const { data } = await api.post('/crops', { ...payload, publish })
        if (staged.length) {
          try {
            await uploadPhotos(data.listing._id, staged)
          } catch (err) {
            setError(errorMessage(err))
            navigate(`/farmer/crops/${data.listing._id}/edit`) // listing is saved; photos can be retried here
            return
          }
        }
      }
      navigate('/farmer/crops')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const MAX_PHOTOS = 4
  const photoCount = images.length + staged.length

  async function uploadPhotos(listingId: string, files: File[]) {
    const fd = new FormData()
    files.forEach((f) => fd.append('images', f))
    const { data } = await api.post(`/crops/${listingId}/images`, fd)
    return data.listing.images as string[]
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!picked.length) return
    if (photoCount + picked.length > MAX_PHOTOS) return setError(t('You can add up to {{n}} photos.', { n: MAX_PHOTOS }))
    if (picked.some((f) => !f.type.startsWith('image/'))) return setError(t('Only photos (JPG, PNG, WebP) are allowed.'))
    if (picked.some((f) => f.size > 3 * 1024 * 1024)) return setError(t('Each photo must be under 3 MB.'))
    setError('')
    if (!editing) return setStaged((s) => [...s, ...picked])
    setPhotoBusy(true)
    try {
      setImages(await uploadPhotos(id!, picked))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setPhotoBusy(false)
    }
  }

  async function removeSaved(url: string) {
    setPhotoBusy(true)
    try {
      const { data } = await api.delete(`/crops/${id}/images/${url.split('/').pop()}`)
      setImages(data.listing.images)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setPhotoBusy(false)
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    save(false)
  }

  if (loading) return <p className="text-slate-500">{t('Loading…')}</p>
  const isDraft = !editing || status === 'draft'
  const price = Number(form.expectedPrice)

  const hint = reference
    ? t('Market reference: {{low}} to {{high}}/kg (median {{median}}) across {{n}} market(s), as of {{date}}. Source: {{source}}.', {
        low: inr(reference.low), high: inr(reference.high), median: inr(reference.median), n: reference.markets,
        date: fmtDate(reference.date), source: reference.sources.map((s) => t(sourceLabel[s])).join(', '),
      })
    : undefined

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link to="/farmer/crops" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft size={16} /> {t('Back to listings')}</Link>
      <h1 className="text-2xl font-bold">{editing ? t('Edit crop listing') : t('Add new crop')}</h1>

      {!editing && <VoiceFill onResult={applyVoice} />}

      <form onSubmit={onSubmit} className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6">
        <section className="grid gap-4 sm:grid-cols-2">
          <Field label={t('Crop name')}><input className="input" value={form.crop} onChange={set('crop')} placeholder="Tomato" required /></Field>
          <Field label={t('Category')}>
            <select className="input" value={form.category} onChange={set('category')}>
              {categories.map((c) => <option key={c} value={c}>{t(c)}</option>)}
            </select>
          </Field>
          <Field label={t('Total quantity (kg)')}><input className="input" type="number" min="1" step="any" value={form.quantity} onChange={set('quantity')} placeholder="1000" required /></Field>
          <Field label={t('Expected price (₹ per kg)')} hint={hint}>
            <input className="input" type="number" min="0.5" step="any" value={form.expectedPrice} onChange={set('expectedPrice')} placeholder="25" required />
            {reference && price > reference.high && <p className="mt-1 text-xs font-medium text-amber-700">{t('Your price is above the reference range, so buyers may negotiate or look elsewhere.')}</p>}
            {reference && price > 0 && price < reference.low && <p className="mt-1 text-xs font-medium text-amber-700">{t('Your price is below the reference range. You may be able to ask for more.')}</p>}
          </Field>
          <Field label={t('Minimum order (kg)')} hint={t('Optional. Smallest quantity a buyer can request.')}><input className="input" type="number" min="1" step="any" value={form.minOrderQty} onChange={set('minOrderQty')} /></Field>
          <Field label={t('Quality grade')}>
            <select className="input" value={form.grade} onChange={set('grade')}>
              <option value="A">{t('Grade A, premium')}</option>
              <option value="B">{t('Grade B, standard')}</option>
              <option value="C">{t('Grade C, lower commercial')}</option>
            </select>
          </Field>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          <Field label={t('Harvest date')}><input className="input" type="date" value={form.harvestDate} onChange={set('harvestDate')} required /></Field>
          <Field label={t('Available from')} hint={t('Optional')}><input className="input" type="date" value={form.availableFrom} onChange={set('availableFrom')} /></Field>
          <Field label={t('Sell by (deadline)')}><input className="input" type="date" min={today} value={form.deadline} onChange={set('deadline')} required /></Field>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <Field label={t('Village')} hint={t('Leave blank to use your profile village.')}><input className="input" value={form.village} onChange={set('village')} /></Field>
          <Field label={t('District')} hint={t('Leave blank to use your profile district.')}><input className="input" value={form.district} onChange={set('district')} /></Field>
        </section>

        <Field label={t('Description (optional)')}>
          <textarea className="input min-h-24" maxLength={500} value={form.description} onChange={set('description')} placeholder={t('Freshly harvested, no pesticides sprayed in the last 10 days…')} />
        </Field>

        <Field label={t('Photos (optional)')} hint={t('Up to {{n}} photos, 3 MB each. Clear photos help buyers trust your listing.', { n: MAX_PHOTOS })}>
          <div className="flex flex-wrap gap-3">
            {images.map((u) => (
              <div key={u} className="relative">
                <img src={u} alt="" className="h-24 w-24 rounded-lg object-cover" />
                <button type="button" disabled={photoBusy} onClick={() => removeSaved(u)} className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-red-600 text-white shadow" aria-label={t('Remove photo')}><X size={14} /></button>
              </div>
            ))}
            {previews.map((u, n) => (
              <div key={u} className="relative">
                <img src={u} alt="" className="h-24 w-24 rounded-lg object-cover" />
                <button type="button" onClick={() => setStaged((s) => s.filter((_, i) => i !== n))} className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-red-600 text-white shadow" aria-label={t('Remove photo')}><X size={14} /></button>
              </div>
            ))}
            {photoCount < MAX_PHOTOS && (
              <label className="grid h-24 w-24 cursor-pointer place-items-center rounded-lg border-2 border-dashed border-slate-300 text-slate-400 hover:border-brand-600 hover:text-brand-600">
                <span className="flex flex-col items-center text-xs"><ImagePlus size={22} />{photoBusy ? t('Uploading…') : t('Add photo')}</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={onPick} disabled={photoBusy} />
              </label>
            )}
          </div>
        </Field>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5">
          <button type="submit" className={isDraft ? 'btn-outline' : 'btn-primary'} disabled={busy}>
            {busy ? t('Saving…') : isDraft ? t('Save as draft') : t('Save changes')}
          </button>
          {isDraft && (
            <button type="button" className="btn-primary" disabled={busy || !verified} onClick={() => {
              const f = document.querySelector('form') as HTMLFormElement
              if (f.reportValidity()) save(true)
            }}>
              {t('Publish')}
            </button>
          )}
          {isDraft && !verified && <p className="text-xs text-amber-700">{t('Publishing unlocks after admin verification.')}</p>}
        </div>
      </form>
    </div>
  )
}
