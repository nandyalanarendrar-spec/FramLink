import { useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { api, errorMessage } from '../api/client'
import { inr } from '../api/crops'
import type { BoardDemand } from '../api/demands'
import DeliveryOption, { deliveryBody, emptyDelivery, transportCost } from './DeliveryOption'
import type { Delivery } from './DeliveryOption'

// Answer a buyer's wanted request from one of your live listings: quantity, price, and who handles transport
export default function OfferDialog({ demand, onClose, onSent }: { demand: BoardDemand; onClose: () => void; onSent: () => void }) {
  const { t } = useTranslation()
  const first = demand.matching[0]
  const [listingId, setListingId] = useState(first._id)
  const listing = demand.matching.find((l) => l._id === listingId) ?? first
  const [quantity, setQuantity] = useState(String(Math.min(demand.remaining, first.availableQty)))
  const [price, setPrice] = useState(String(Math.min(first.expectedPrice, demand.maxPrice)))
  const [message, setMessage] = useState('')
  const [delivery, setDelivery] = useState<Delivery>(emptyDelivery)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const total = Number(quantity) * Number(price)
  const shipping = transportCost(delivery)
  const maxQty = Math.min(demand.remaining, listing.availableQty)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await api.post(`/demands/${demand._id}/offers`, { listingId, quantity, price, ...(message.trim() && { message: message.trim() }), ...deliveryBody(delivery) })
      onSent()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <form onSubmit={submit} className="max-h-[92vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div><h2 className="text-lg font-bold">{t('Offer {{crop}} to {{name}}', { crop: demand.crop, name: demand.buyer.name })}</h2><p className="text-sm text-slate-500">{t('Up to {{p}}/kg · {{n}} kg still needed', { p: inr(demand.maxPrice), n: demand.remaining.toLocaleString('en-IN') })}</p></div>
          <button type="button" onClick={onClose} aria-label={t('Close')} className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
        </div>
        {demand.matching.length > 1 && (
          <div>
            <label className="mb-1 block text-xs font-medium">{t('From which listing')}</label>
            <select className="input" value={listingId} onChange={(e) => setListingId(e.target.value)}>
              {demand.matching.map((l) => <option key={l._id} value={l._id}>{t('{{n}} kg available at {{p}}/kg', { n: l.availableQty.toLocaleString('en-IN'), p: inr(l.expectedPrice) })}</option>)}
            </select>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div><label className="mb-1 block text-xs font-medium">{t('Quantity (kg)')}</label><input className="input" type="number" min={listing.minOrderQty ?? 1} max={maxQty} step="any" required value={quantity} onChange={(e) => setQuantity(e.target.value)} /></div>
          <div><label className="mb-1 block text-xs font-medium">{t('Your price (₹/kg)')}</label><input className="input" type="number" min="0.5" max={demand.maxPrice} step="any" required value={price} onChange={(e) => setPrice(e.target.value)} /></div>
        </div>
        <p className="text-xs text-slate-500">{t('You can offer up to {{n}} kg (what you have and what the buyer still needs).', { n: maxQty.toLocaleString('en-IN') })}</p>
        <DeliveryOption value={delivery} onChange={setDelivery} quantity={Number(quantity) || 0} />
        <div><label className="mb-1 block text-xs font-medium">{t('Message (optional)')}</label><input className="input" maxLength={300} value={message} onChange={(e) => setMessage(e.target.value)} /></div>
        {total > 0 && <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">{t('Buyer pays in total')}: <b>{inr(total + shipping)}</b>{shipping > 0 && <span className="text-slate-500"> {t('(crop {{c}} + transport {{s}})', { c: inr(total), s: inr(shipping) })}</span>}</p>}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex gap-2"><button className="btn-primary" disabled={busy}>{busy ? t('Sending…') : t('Send offer')}</button><button type="button" className="btn-outline" onClick={onClose}>{t('Cancel')}</button></div>
        <p className="text-xs text-slate-500">{t('The stock is reserved only if the buyer accepts your offer.')}</p>
      </form>
    </div>
  )
}
