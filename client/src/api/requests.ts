import { T } from '../i18n'

export type RequestStatus = 'requested' | 'negotiating' | 'accepted' | 'rejected' | 'cancelled'

export interface HistoryEntry {
  by: 'buyer' | 'farmer'
  action: 'offer' | 'counter' | 'accept' | 'reject' | 'cancel'
  price?: number
  quantity?: number
  transportBy?: 'buyer' | 'farmer'
  transportCharge?: number
  message?: string
  at: string
}

export interface PurchaseRequest {
  _id: string
  status: RequestStatus
  isOpen: boolean
  crop: string
  askingPrice: number
  quantity: number
  price: number
  transportBy?: 'buyer' | 'farmer'
  ratePerKm?: number | null
  distanceKm?: number | null
  transportCharge?: number
  message?: string
  neededBy?: string
  history: HistoryEntry[]
  finalPrice?: number
  finalQuantity?: number
  acceptedAt?: string
  orderId?: string | null
  createdAt: string
  updatedAt: string
  myTurn: boolean
  listing: { _id: string; crop: string; expectedPrice: number; availableQty: number; status: string; village: string; district: string; minOrderQty?: number }
  counterpart: { name: string; detail?: string; phone?: string; rating?: { avg: number; count: number } | null }
}

export interface RequestCounts {
  open: number
  accepted: number
  closed: number
}

export const requestStatusMeta: Record<RequestStatus, { label: string; cls: string }> = {
  requested: { label: T('Requested'), cls: 'bg-blue-100 text-blue-700' },
  negotiating: { label: T('Negotiating'), cls: 'bg-amber-100 text-amber-700' },
  accepted: { label: T('Accepted'), cls: 'bg-brand-100 text-brand-700' },
  rejected: { label: T('Rejected'), cls: 'bg-red-100 text-red-700' },
  cancelled: { label: T('Cancelled'), cls: 'bg-slate-200 text-slate-600' },
}
