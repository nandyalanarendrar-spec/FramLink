import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { CheckCircle, Copy, DownloadCloud, Terminal, Trash2 } from 'lucide-react'
import { api, errorMessage } from '../../api/client'
import { fmtDate, inr } from '../../api/crops'
import { sourceLabel } from '../../api/prices'
import type { PriceSource } from '../../api/prices'

interface Row { _id: string; crop: string; market: string; district: string; minPrice: number; maxPrice: number; modalPrice: number; date: string; source: PriceSource }
interface Status {
  agmarknetConfigured: boolean
  total: number
  newestDate: string | null
  autoImport: boolean
  lastImport: { at: string | null; trigger: string | null; ok: boolean | null; saved: number; fetched: number; error: string | null }
}

const empty = { crop: '', market: '', district: '', minPrice: '', maxPrice: '', modalPrice: '', date: new Date().toISOString().slice(0, 10) }
const LOCAL_CMD = 'cd server && npm run import:prices'

export default function MarketPrices() {
  const [status, setStatus] = useState<Status | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [districts, setDistricts] = useState<string[]>([])
  const [form, setForm] = useState(empty)
  const [busy, setBusy] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [geoBlocked, setGeoBlocked] = useState(false)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    const [s, l] = await Promise.all([api.get('/admin/prices/status'), api.get('/admin/prices')])
    setStatus(s.data)
    setRows(l.data.prices)
  }, [])

  useEffect(() => {
    load().catch((err) => setError(errorMessage(err)))
    api.get('/admin/prices/districts').then(({ data }) => setDistricts(data.districts)).catch(() => {})
  }, [load])

  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function add(e: FormEvent) {
    e.preventDefault()
    setError(''); setNotice(''); setBusy(true)
    try {
      const body: Record<string, string> = {}
      for (const [k, v] of Object.entries(form)) if (v !== '') body[k] = v
      await api.post('/admin/prices', body)
      setNotice(`Saved ${form.crop} price for ${form.market}.`)
      setForm({ ...empty, date: form.date, district: form.district })
      await load()
    } catch (err) { setError(errorMessage(err)) } finally { setBusy(false) }
  }

  async function runImport() {
    setError(''); setNotice(''); setGeoBlocked(false); setImporting(true)
    try {
      const { data } = await api.post('/admin/prices/import')
      if (data.geoBlocked) {
        setGeoBlocked(true)
      } else {
        setNotice(`Imported ${data.saved} price rows (${data.fetched} records fetched).`)
        await load()
      }
    } catch (err) { setError(errorMessage(err)) } finally { setImporting(false) }
  }

  async function remove(r: Row) {
    if (!window.confirm(`Delete ${r.crop} price for ${r.market}?`)) return
    try { await api.delete(`/admin/prices/${r._id}`); await load() } catch (err) { setError(errorMessage(err)) }
  }

  function copyCmd() {
    navigator.clipboard.writeText(LOCAL_CMD)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Market prices</h1>
        <p className="text-sm text-slate-500">Real mandi prices that power farmers' Price Comparison. Only enter prices you have read from a real market or government source.</p>
      </div>

      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="text-sm">
          <p><b>{status?.total ?? 0}</b> price rows stored{status?.newestDate && <> · newest {fmtDate(status.newestDate)}</>}</p>
          <p className="text-slate-500">AGMARKNET (data.gov.in): {status?.agmarknetConfigured ? 'API key configured' : 'not configured. Add DATA_GOV_API_KEY to server/.env'}</p>
          {status?.autoImport && <p className="text-slate-500">Auto-import runs daily at 9:00 AM and 6:00 PM IST.</p>}
          {status?.lastImport?.at && (
            <p className={status.lastImport.ok ? 'text-brand-700' : 'text-red-600'}>
              Last import ({status.lastImport.trigger}) {new Date(status.lastImport.at).toLocaleString('en-IN')}: {status.lastImport.ok ? `${status.lastImport.saved} rows saved` : `failed. ${status.lastImport.error}`}
            </p>
          )}
        </div>
        <button className="btn-primary gap-2" disabled={!status?.agmarknetConfigured || importing} onClick={runImport}>
          <DownloadCloud size={18} /> {importing ? 'Importing…' : 'Import latest AP mandi prices'}
        </button>
      </section>

      {/* Geo-block panel: shown when Render's US servers cannot reach data.gov.in */}
      {geoBlocked && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <Terminal size={22} className="mt-0.5 shrink-0 text-amber-700" />
            <div className="flex-1">
              <p className="font-semibold text-amber-900">data.gov.in is not reachable from Render's servers</p>
              <p className="mt-1 text-sm text-amber-800">
                India's government API blocks foreign cloud servers (US/EU). Run this one command on your <b>local machine</b> — it fetches prices from data.gov.in and saves them directly to the database:
              </p>
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-900 px-4 py-3">
                <code className="flex-1 font-mono text-sm text-amber-100">{LOCAL_CMD}</code>
                <button
                  onClick={copyCmd}
                  className="flex shrink-0 items-center gap-1.5 rounded-md bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600"
                >
                  {copied ? <><CheckCircle size={14} /> Copied!</> : <><Copy size={14} /> Copy</>}
                </button>
              </div>
              <p className="mt-3 text-xs text-amber-700">After running the command, click <b>Refresh</b> below to see the updated price count.</p>
              <button
                onClick={() => { setGeoBlocked(false); load() }}
                className="mt-2 text-sm font-semibold text-amber-800 underline hover:text-amber-900"
              >
                ↻ Refresh price count
              </button>
            </div>
          </div>
        </section>
      )}

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {notice && <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{notice}</p>}

      <form onSubmit={add} className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold">Add a price (₹ per kg)</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div><label className="mb-1 block text-xs font-medium">Crop</label><input className="input" required value={form.crop} onChange={set('crop')} placeholder="Tomato" /></div>
          <div><label className="mb-1 block text-xs font-medium">Market (mandi)</label><input className="input" required value={form.market} onChange={set('market')} placeholder="Anantapur" /></div>
          <div><label className="mb-1 block text-xs font-medium">District</label>
            <select className="input" required value={form.district} onChange={set('district')}><option value="" disabled>Select…</option>{districts.map((d) => <option key={d} value={d}>{d}</option>)}</select></div>
          <div><label className="mb-1 block text-xs font-medium">Date observed</label><input className="input" type="date" required max={new Date().toISOString().slice(0, 10)} value={form.date} onChange={set('date')} /></div>
          <div><label className="mb-1 block text-xs font-medium">Min price</label><input className="input" type="number" step="any" min="0.1" required value={form.minPrice} onChange={set('minPrice')} /></div>
          <div><label className="mb-1 block text-xs font-medium">Max price</label><input className="input" type="number" step="any" min="0.1" required value={form.maxPrice} onChange={set('maxPrice')} /></div>
          <div><label className="mb-1 block text-xs font-medium">Modal price (optional)</label><input className="input" type="number" step="any" min="0.1" value={form.modalPrice} onChange={set('modalPrice')} /></div>
          <div className="flex items-end"><button className="btn-primary w-full" disabled={busy}>{busy ? 'Saving…' : 'Save price'}</button></div>
        </div>
        <p className="mt-2 text-xs text-slate-500">Modal = the most common price that day. If left blank, the midpoint of min and max is used. Entering the same crop, market and date again corrects the earlier entry.</p>
      </form>

      <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="p-3">Crop</th><th className="p-3">Market</th><th className="p-3">Min / Modal / Max</th><th className="p-3">Date</th><th className="p-3">Source</th><th className="p-3" /></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-slate-500">No prices yet.</td></tr>}
            {rows.map((r) => (
              <tr key={r._id} className="border-b border-slate-100 last:border-0">
                <td className="p-3 font-semibold">{r.crop}</td>
                <td className="p-3">{r.market}<span className="block text-xs capitalize text-slate-500">{r.district}</span></td>
                <td className="p-3">{inr(r.minPrice)} / <b>{inr(r.modalPrice)}</b> / {inr(r.maxPrice)}</td>
                <td className="p-3">{fmtDate(r.date)}</td>
                <td className="p-3 text-xs text-slate-500">{sourceLabel[r.source]}</td>
                <td className="p-3 text-right">{r.source === 'admin' && <button className="text-slate-400 hover:text-red-600" onClick={() => remove(r)} aria-label="Delete"><Trash2 size={16} /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
