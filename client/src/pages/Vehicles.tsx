import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { MapPin, Search, Truck, X } from 'lucide-react'
import { api, errorMessage } from '../api/client'
import { inr } from '../api/crops'
import type { Order } from '../api/orders'
import { useAuth } from '../context/AuthContext'
import Stars from '../components/Stars'
import type { Score } from '../components/Stars'

interface VehicleCard {
  _id: string
  name: string
  vehicleType: string
  plate: string
  capacityKg: number
  ratePerKm: number | null
  serviceArea: string
  trips: number
  rating: Score | null
}

// Browse every verified vehicle, like the crop marketplace, and book one for an order
export default function Vehicles() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const role = user?.role === 'farmer' ? 'farmer' : 'buyer'
  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  const [minCapacity, setMinCapacity] = useState('')
  const [sort, setSort] = useState('new')
  const [types, setTypes] = useState<string[]>([])
  const [vehicles, setVehicles] = useState<VehicleCard[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [booking, setBooking] = useState<VehicleCard | null>(null)
  const [done, setDone] = useState('')

  const load = useCallback(async () => {
    try {
      const params: Record<string, string> = { sort }
      if (q.trim()) params.q = q.trim()
      if (type) params.type = type
      if (minCapacity) params.minCapacity = minCapacity
      const { data } = await api.get('/transport/vehicles', { params })
      setVehicles(data.vehicles)
      setTypes(data.types)
      setError('')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [q, type, minCapacity, sort])

  useEffect(() => {
    const timer = setTimeout(load, 300)
    return () => clearTimeout(timer)
  }, [load])

  // Orders this person can still book transport for (they are the one arranging it, nothing booked yet)
  useEffect(() => {
    api.get('/orders/mine').then(({ data }) => {
      setOrders((data.orders as Order[]).filter((o) => ['confirmed', 'ready_for_pickup'].includes(o.status)
        && (!o.transportBy || o.transportBy === role)
        && !(o.transport && ['open', 'accepted', 'picked_up'].includes(o.transport.status))))
    }).catch(() => setOrders([]))
  }, [role, done])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">{t('Find Vehicles')}</h1>
        <p className="text-sm text-slate-500">{t('All verified transporters. Pick a vehicle and send it your transport job. Phone numbers are shared only after the transporter accepts.')}</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input py-2.5 pl-10" placeholder={t('Search by area, name or type')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input w-auto py-2.5" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">{t('All vehicle types')}</option>
          {types.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <input className="input w-40 py-2.5" type="number" min="0" placeholder={t('Min capacity (kg)')} value={minCapacity} onChange={(e) => setMinCapacity(e.target.value)} />
        <select className="input w-auto py-2.5" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="new">{t('Newest')}</option>
          <option value="price">{t('Lowest ₹/km')}</option>
          <option value="capacity">{t('Largest capacity')}</option>
        </select>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {done && <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">{done} <Link to={`/${role}/transport`} className="font-semibold underline">{t('View transport requests')}</Link></p>}

      {loading ? (
        <p className="text-slate-500">{t('Loading…')}</p>
      ) : vehicles.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <Truck className="mx-auto text-slate-400" size={32} />
          <p className="mt-2 font-semibold">{t('No vehicles match')}</p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {vehicles.map((v) => (
            <li key={v._id} className="flex flex-col rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-lg bg-brand-100 text-brand-700"><Truck size={22} /></span>
                  <div><h3 className="font-bold">{v.vehicleType}</h3><p className="text-xs text-slate-500">{v.name} · {v.plate}</p></div>
                </div>
                <div className="text-right">
                  {v.ratePerKm ? <p className="text-lg font-extrabold text-brand-700">{inr(v.ratePerKm)}<span className="text-xs font-medium text-slate-500">/{t('km')}</span></p> : <p className="text-xs text-slate-400">{t('Rate on request')}</p>}
                </div>
              </div>
              <dl className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between"><dt className="text-slate-500">{t('Capacity')}</dt><dd className="font-medium">{t('{{n}} kg', { n: v.capacityKg.toLocaleString('en-IN') })}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">{t('Trips delivered')}</dt><dd className="font-medium">{v.trips}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">{t('Rating')}</dt><dd><Stars rating={v.rating} /></dd></div>
                {v.serviceArea && <div className="flex items-start gap-1.5 text-slate-600"><MapPin size={15} className="mt-0.5 shrink-0 text-slate-400" />{v.serviceArea}</div>}
              </dl>
              <div className="mt-4 flex-1 border-t border-slate-100 pt-4">
                <button className="btn-primary w-full" onClick={() => { setDone(''); setBooking(v) }}>{t('Book this vehicle')}</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {booking && (
        <BookDialog
          vehicle={booking}
          orders={orders.filter((o) => o.quantity <= booking.capacityKg)}
          role={role}
          onClose={() => setBooking(null)}
          onBooked={(m) => { setBooking(null); setDone(m) }}
        />
      )}
    </div>
  )
}

function BookDialog({ vehicle, orders, role, onClose, onBooked }: { vehicle: VehicleCard; orders: Order[]; role: string; onClose: () => void; onBooked: (msg: string) => void }) {
  const { t } = useTranslation()
  const [orderId, setOrderId] = useState(orders[0]?._id ?? '')
  const order = orders.find((o) => o._id === orderId)
  const [f, setF] = useState({ pickupAddress: '', dropAddress: '', pickupDate: '', ratePerKm: vehicle.ratePerKm ? String(vehicle.ratePerKm) : '', distanceKm: '', notes: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const total = Math.round(Number(f.ratePerKm) * Number(f.distanceKm)) || 0

  // Fill the addresses from the chosen order
  useEffect(() => {
    if (!order) return
    setF((x) => ({
      ...x,
      pickupAddress: x.pickupAddress || (order.pickupFrom ? `${order.pickupFrom.village}, ${order.pickupFrom.district}` : ''),
      dropAddress: x.dropAddress || order.dropTo || '',
    }))
  }, [order])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await api.post('/transport', { orderId, transporterId: vehicle._id, pickupAddress: f.pickupAddress, dropAddress: f.dropAddress, pickupDate: f.pickupDate, ratePerKm: f.ratePerKm, distanceKm: f.distanceKm, ...(f.notes.trim() && { notes: f.notes.trim() }) })
      onBooked(t('Request sent to {{name}}. You will be notified when they accept.', { name: vehicle.name }))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div><h2 className="text-lg font-bold">{t('Book {{type}}', { type: vehicle.vehicleType })}</h2><p className="text-sm text-slate-500">{vehicle.name} · {t('{{n}} kg', { n: vehicle.capacityKg.toLocaleString('en-IN') })}</p></div>
          <button onClick={onClose} aria-label={t('Close')} className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
        </div>

        {orders.length === 0 ? (
          <div className="mt-4 space-y-3 text-sm text-slate-600">
            <p>{t('You have no order that needs transport and fits this vehicle.')}</p>
            <p className="text-xs text-slate-500">{role === 'farmer' ? t('You book transport only for orders where you agreed to deliver.') : t('You book transport only for orders where you collect or arrange it.')}</p>
            <Link to={`/${role}/orders`} className="btn-outline">{t('Go to my orders')}</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium">{t('Order')}</label>
              <select className="input" value={orderId} onChange={(e) => setOrderId(e.target.value)}>
                {orders.map((o) => <option key={o._id} value={o._id}>{o.crop} · {t('{{n}} kg', { n: o.quantity.toLocaleString('en-IN') })}</option>)}
              </select>
            </div>
            <div><label className="mb-1 block text-xs font-medium">{t('Pickup address')}</label><input className="input" required minLength={5} value={f.pickupAddress} onChange={(e) => setF({ ...f, pickupAddress: e.target.value })} /></div>
            <div><label className="mb-1 block text-xs font-medium">{t('Delivery address')}</label><input className="input" required minLength={5} value={f.dropAddress} onChange={(e) => setF({ ...f, dropAddress: e.target.value })} /></div>
            <div><label className="mb-1 block text-xs font-medium">{t('Pickup date')}</label><input className="input" type="date" required min={new Date().toISOString().slice(0, 10)} value={f.pickupDate} onChange={(e) => setF({ ...f, pickupDate: e.target.value })} /></div>
            <div><label className="mb-1 block text-xs font-medium">{t('Notes (optional)')}</label><input className="input" maxLength={300} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
            <div><label className="mb-1 block text-xs font-medium">{t('Cost per km (₹)')}</label><input className="input" type="number" min="1" step="any" required value={f.ratePerKm} onChange={(e) => setF({ ...f, ratePerKm: e.target.value })} /></div>
            <div><label className="mb-1 block text-xs font-medium">{t('Distance (km)')}</label><input className="input" type="number" min="1" step="any" required value={f.distanceKm} onChange={(e) => setF({ ...f, distanceKm: e.target.value })} /></div>
            {total > 0 && order && <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800 sm:col-span-2">{t('Transport cost for {{n}} kg', { n: order.quantity.toLocaleString('en-IN') })}: <b>{inr(total)}</b></p>}
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">{error}</p>}
            <div className="flex gap-2 sm:col-span-2"><button className="btn-primary" disabled={busy}>{busy ? t('Sending…') : t('Send request')}</button><button type="button" className="btn-outline" onClick={onClose}>{t('Cancel')}</button></div>
          </form>
        )}
      </div>
    </div>
  )
}
