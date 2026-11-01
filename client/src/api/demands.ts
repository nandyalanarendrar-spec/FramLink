import type { Score } from '../components/Stars'

export interface Demand {
  _id: string
  crop: string
  quantity: number
  filledQty: number
  remaining: number
  maxPrice: number
  neededBy: string
  deliverTo: string
  notes?: string
  status: 'open' | 'filled' | 'closed'
  isOpen: boolean
  expired: boolean
  pendingOffers?: number
  createdAt: string
}

export interface DemandOfferView {
  _id: string
  status: 'pending' | 'accepted' | 'declined' | 'withdrawn'
  quantity: number
  price: number
  total: number
  transportBy: 'buyer' | 'farmer'
  ratePerKm?: number
  distanceKm?: number
  transportCharge: number
  grandTotal: number
  message?: string
  orderId: string | null
  farmer: { name: string; rating: Score | null }
  listing: { village?: string; district?: string; grade?: string; image?: string; availableQty?: number }
}

export interface BoardDemand extends Demand {
  buyer: { name: string; type?: string; business?: string; rating: Score | null }
  matching: { _id: string; availableQty: number; expectedPrice: number; minOrderQty?: number }[]
  myOffer: { _id: string; quantity: number; price: number } | null
}

export interface MyOffer {
  _id: string
  status: 'pending' | 'accepted' | 'declined' | 'withdrawn'
  quantity: number
  price: number
  transportBy: 'buyer' | 'farmer'
  transportCharge: number
  grandTotal: number
  orderId: string | null
  createdAt: string
  demand: { crop: string; maxPrice: number; neededBy: string; deliverTo: string; status: string } | null
}
