import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { BadgeCheck, CalendarClock, ChevronLeft, ChevronRight, MapPin, Search, SearchX } from 'lucide-react'
import { api, errorMessage } from '../../api/client'
import { categories, fmtDate, inr } from '../../api/crops'
import type { MarketListing } from '../../api/crops'
import { T } from '../../i18n'

const initial = { q: '', category: '', district: '', grade: '', minPrice: '', maxPrice: '', minQty: '', sort: 'newest' }
type Filters = typeof initial

const sorts = [
  { value: 'newest', label: T('Newest first') },
  { value: 'price_asc', label: T('Price: low to high') },
  { value: 'price_desc', label: T('Price: high to low') },
  { value: 'qty_desc', label: T('Most quantity') },
  { value: 'deadline', label: T('Ending soon') },
]

export default function Marketplace() {
  const { t } = useTranslation()
  const [filters, setFilters] = useState<Filters>(initial)
  const [page, setPage] = useState(1)
  const [listings, setListings] = useState<MarketListing[]>([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [districts, setDistricts] = useState<string[]>([])
  const [crops, setCrops] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/marketplace/facets').then(({ data }) => { setDistricts(data.districts); setCrops(data.crops) }).catch(() => {})
  }, [])

  // Refetch (debounced) whenever a filter or the page changes
  useEffect(() => {
    const timer = setTimeout(async () => {
      setError('')
      try {
        const params: Record<string, string | number> = { page, limit: 12 }
        for (const [k, v] of Object.entries(filters)) if (v !== '') params[k] = v
        const { data } = await api.get('/marketplace', { params })
        setListings(data.listings)
        setTotal(data.total)
        setPages(data.pages)
      } catch (err) {
        setError(errorMessage(err))
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [filters, page])

  const set = (k: keyof Filters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setPage(1)
    setFilters((f) => ({ ...f, [k]: e.target.value }))
  }
  const dirty = JSON.stringify(filters) !== JSON.stringify(initial)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">{t('Marketplace')}</h1>
        <p className="text-sm text-slate-500">{t('Fresh produce from verified farmers. Filter by crop, location, price and quantity.')}</p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input py-2.5 pl-10" list="crop-names" placeholder={t('Search crops, e.g. Tomato')} value={filters.q} onChange={set('q')} />
          <datalist id="crop-names">{crops.map((c) => <option key={c} value={c} />)}</datalist>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <select className="input" value={filters.category} onChange={set('category')} aria-label={t('Category')}>
            <option value="">{t('All categories')}</option>
            {categories.map((c) => <option key={c} value={c}>{t(c)}</option>)}
          </select>
          <select className="input capitalize" value={filters.district} onChange={set('district')} aria-label={t('District')}>
            <option value="">{t('All districts')}</option>
            {districts.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select className="input" value={filters.grade} onChange={set('grade')} aria-label={t('Grade')}>
            <option value="">{t('Any grade')}</option>
            <option value="A">{t('Grade A')}</option>
            <option value="B">{t('Grade B')}</option>
            <option value="C">{t('Grade C')}</option>
          </select>
          <select className="input" value={filters.sort} onChange={set('sort')} aria-label={t('Sort')}>
            {sorts.map((s) => <option key={s.value} value={s.value}>{t(s.label)}</option>)}
          </select>
          <input className="input" type="number" min="0" placeholder={t('Min price (₹/kg)')} value={filters.minPrice} onChange={set('minPrice')} />
          <input className="input" type="number" min="0" placeholder={t('Max price (₹/kg)')} value={filters.maxPrice} onChange={set('maxPrice')} />
          <input className="input" type="number" min="0" placeholder={t('Quantity needed (kg)')} value={filters.minQty} onChange={set('minQty')} />
          <button className="btn-outline" disabled={!dirty} onClick={() => { setFilters(initial); setPage(1) }}>{t('Clear filters')}</button>
        </div>
      </section>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {loading ? (
        <p className="text-slate-500">{t('Loading…')}</p>
      ) : listings.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <SearchX className="mx-auto text-slate-400" size={32} />
          <p className="mt-2 font-semibold">{t('No crops match your filters')}</p>
          <p className="text-sm text-slate-500">{t('Try a different crop, district or price range.')}</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-slate-500">{t('Listings found: {{n}}', { n: total })}</p>
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {listings.map((l) => (
              <li key={l._id}>
                <Link to={`/buyer/marketplace/${l._id}`} className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-lg">
                  {l.images?.[0] && <img src={l.images[0]} alt={l.crop} loading="lazy" className="mb-3 h-36 w-full rounded-lg object-cover" />}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-lg font-bold">{l.crop}</h3>
                      <p className="text-xs text-slate-500">{t(l.category)} · {t('Grade {{g}}', { g: l.grade })}</p>
                    </div>
                    <p className="text-right text-xl font-extrabold text-brand-700">{inr(l.expectedPrice)}<span className="block text-xs font-medium text-slate-500">{t('per kg')}</span></p>
                  </div>

                  <p className="mt-3 text-sm"><b>{t('{{n}} kg available', { n: l.availableQty.toLocaleString('en-IN') })}</b>{l.minOrderQty ? <span className="text-slate-500"> · {t('min {{n}} kg', { n: l.minOrderQty })}</span> : null}</p>

                  <ul className="mt-3 space-y-1 text-xs text-slate-600">
                    <li className="flex items-center gap-1.5 capitalize"><MapPin size={14} className="text-slate-400" />{l.village}, {l.district}</li>
                    <li className="flex items-center gap-1.5"><CalendarClock size={14} className="text-slate-400" />{t('Harvest {{h}} · Sell by {{d}}', { h: fmtDate(l.harvestDate), d: fmtDate(l.deadline) })}</li>
                  </ul>

                  <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3 text-sm">
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">{l.farmer.name[0]}</span>
                    <span className="font-medium">{l.farmer.name}</span>
                    <span className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-brand-700"><BadgeCheck size={14} /> {t('Verified')}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {pages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <button className="btn-outline gap-1" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft size={16} /> {t('Prev')}</button>
              <span className="text-sm text-slate-600">{t('Page {{p}} of {{n}}', { p: page, n: pages })}</span>
              <button className="btn-outline gap-1" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>{t('Next')} <ChevronRight size={16} /></button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
