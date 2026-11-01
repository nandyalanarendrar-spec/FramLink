import { useTranslation } from 'react-i18next'
import { Truck, UserRound } from 'lucide-react'
import { inr } from '../api/crops'

export interface Delivery {
  transportBy: 'buyer' | 'farmer'
  ratePerKm: string
  distanceKm: string
}

export const emptyDelivery: Delivery = { transportBy: 'buyer', ratePerKm: '', distanceKm: '' }

/** What to send to the API: ₹/km and km only matter when the farmer delivers */
export function deliveryBody(d: Delivery) {
  return d.transportBy === 'farmer' ? { transportBy: 'farmer', ratePerKm: d.ratePerKm, distanceKm: d.distanceKm } : { transportBy: 'buyer' }
}

export const transportCost = (d: Delivery) => (d.transportBy === 'farmer' ? Math.round(Number(d.ratePerKm) * Number(d.distanceKm)) || 0 : 0)

// Who moves the crop? If the farmer delivers, the cost (₹ per km x km) is added to the buyer's total.
export default function DeliveryOption({ value, onChange, quantity }: { value: Delivery; onChange: (d: Delivery) => void; quantity: number }) {
  const { t } = useTranslation()
  const cost = transportCost(value)
  const opt = (v: Delivery['transportBy'], Icon: typeof Truck, title: string, hint: string) => (
    <label className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm transition ${value.transportBy === v ? 'border-brand-600 bg-brand-50' : 'border-slate-200 hover:bg-slate-50'}`}>
      <input type="radio" name="transportBy" className="mt-1" checked={value.transportBy === v} onChange={() => onChange({ ...value, transportBy: v })} />
      <span><span className="flex items-center gap-1.5 font-semibold"><Icon size={15} /> {title}</span><span className="block text-xs text-slate-500">{hint}</span></span>
    </label>
  )
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 block text-xs font-medium">{t('Who arranges transport?')}</legend>
      <div className="grid gap-2">
        {opt('buyer', UserRound, t('Buyer collects / arranges'), t('No transport cost for the farmer.'))}
        {opt('farmer', Truck, t('Farmer delivers'), t('Transport cost is added to the buyer’s total.'))}
      </div>
      {value.transportBy === 'farmer' && (
        <div className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3">
          <div><label className="mb-1 block text-xs font-medium">{t('Cost per km (₹)')}</label><input className="input bg-white" type="number" min="1" step="any" required value={value.ratePerKm} onChange={(e) => onChange({ ...value, ratePerKm: e.target.value })} /></div>
          <div><label className="mb-1 block text-xs font-medium">{t('Distance (km)')}</label><input className="input bg-white" type="number" min="1" step="any" required value={value.distanceKm} onChange={(e) => onChange({ ...value, distanceKm: e.target.value })} /></div>
          <p className="col-span-2 text-sm text-slate-600">
            {cost > 0 ? <>{t('Transport cost for {{n}} kg', { n: quantity.toLocaleString('en-IN') })}: <b>{inr(cost)}</b></> : t('Enter the cost per km and the distance.')}
          </p>
        </div>
      )}
    </fieldset>
  )
}
