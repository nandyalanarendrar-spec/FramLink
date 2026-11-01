import { T } from '../i18n'

export type OrderStatus = 'confirmed' | 'ready_for_pickup' | 'in_transit' | 'delivered' | 'completed' | 'cancelled'
export type TransportStatus = 'open' | 'accepted' | 'picked_up' | 'delivered' | 'cancelled'

export const orderSteps: OrderStatus[] = ['confirmed', 'ready_for_pickup', 'in_transit', 'delivered', 'completed']

export const orderStatusMeta: Record<OrderStatus, { label: string; cls: string }> = {
  confirmed: { label: T('Confirmed'), cls: 'bg-blue-100 text-blue-700' },
  ready_for_pickup: { label: T('Ready for pickup'), cls: 'bg-amber-100 text-amber-700' },
  in_transit: { label: T('In transit'), cls: 'bg-purple-100 text-purple-700' },
  delivered: { label: T('Delivered'), cls: 'bg-teal-100 text-teal-700' },
  completed: { label: T('Completed'), cls: 'bg-brand-100 text-brand-700' },
  cancelled: { label: T('Cancelled'), cls: 'bg-slate-200 text-slate-600' },
}

export const transportStatusMeta: Record<TransportStatus, { label: string; cls: string }> = {
  open: { label: T('Open'), cls: 'bg-blue-100 text-blue-700' },
  accepted: { label: T('Accepted'), cls: 'bg-amber-100 text-amber-700' },
  picked_up: { label: T('Picked up'), cls: 'bg-purple-100 text-purple-700' },
  delivered: { label: T('Delivered'), cls: 'bg-brand-100 text-brand-700' },
  cancelled: { label: T('Cancelled'), cls: 'bg-slate-200 text-slate-600' },
}

export interface Transport {
  _id: string
  orderId?: string
  orderStatus?: OrderStatus
  status: TransportStatus
  crop: string
  weightKg: number
  pickupAddress: string
  dropAddress: string
  pickupDate: string
  charge: number
  ratePerKm?: number
  distanceKm?: number
  actualKm?: number
  finalCharge?: number
  paymentStatus?: 'pending' | 'paid'
  paidAt?: string
  timeline?: { status: string; at: string }[]
  notes?: string
  createdAt: string
  updatedAt: string
  requestedBy?: 'farmer' | 'buyer'
  counterpart: { name: string; phone?: string; vehicle?: string } | null
  /** Pickup and delivery contacts, shown to the assigned transporter */
  contacts?: { farmer: { name: string; phone?: string }; buyer: { name: string; phone?: string } } | null
}

export interface Order {
  _id: string
  crop: string
  quantity: number
  price: number
  total: number
  transportBy?: 'buyer' | 'farmer'
  transportCharge?: number
  grandTotal?: number
  ratePerKm?: number
  distanceKm?: number
  status: OrderStatus
  paymentStatus: 'pending' | 'paid'
  paidAt?: string
  rating?: { stars: number; comment?: string }
  cancelledBy?: 'farmer' | 'buyer'
  cancelReason?: string
  createdAt: string
  updatedAt: string
  timeline: { status: OrderStatus; by: string; note?: string; at: string }[]
  counterpart: { name: string; phone: string; detail?: string; rating?: { avg: number; count: number } | null }
  pickupFrom?: { village: string; district: string }
  dropTo?: string
  transport: null | {
    _id: string
    requester?: string
    requesterRole?: 'farmer' | 'buyer'
    status: TransportStatus
    charge: number
    ratePerKm?: number
    distanceKm?: number
    actualKm?: number
    finalCharge?: number
    paymentStatus?: 'pending' | 'paid'
    paidAt?: string
    timeline?: { status: string; at: string }[]
    pickupAddress: string
    dropAddress: string
    pickupDate: string
    transporter?: { name: string; phone: string; vehicleType?: string; vehicleNumber?: string }
  }
}

export interface OrderSummary {
  orders: number
  quantity: number
  value: number
  byCrop: { crop: string; quantity: number; value: number }[]
  byMonth: { month: string; value: number }[]
  unpaid: { value: number; orders: number }
}
