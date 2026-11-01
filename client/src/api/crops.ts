import { T, dateLocale } from '../i18n'

export type CropStatus = 'draft' | 'active' | 'partially_sold' | 'sold_out' | 'paused' | 'expired' | 'withdrawn'

export interface Crop {
  _id: string
  crop: string
  category: string
  quantity: number
  availableQty: number
  minOrderQty?: number
  expectedPrice: number
  grade: 'A' | 'B' | 'C'
  harvestDate: string
  availableFrom?: string
  deadline: string
  district: string
  village: string
  description?: string
  images?: string[]
  status: CropStatus
  createdAt: string
}

export const categories = [T('vegetable'), T('fruit'), T('grain'), T('pulse'), T('spice'), T('other')]

export const statusMeta: Record<CropStatus, { label: string; cls: string }> = {
  draft: { label: T('Draft'), cls: 'bg-slate-100 text-slate-700' },
  active: { label: T('Active'), cls: 'bg-brand-100 text-brand-700' },
  partially_sold: { label: T('Partially sold'), cls: 'bg-blue-100 text-blue-700' },
  sold_out: { label: T('Sold out'), cls: 'bg-purple-100 text-purple-700' },
  paused: { label: T('Paused'), cls: 'bg-amber-100 text-amber-700' },
  expired: { label: T('Expired'), cls: 'bg-red-100 text-red-700' },
  withdrawn: { label: T('Withdrawn'), cls: 'bg-slate-200 text-slate-600' },
}

export const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`
export const fmtDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '-'
export const toInputDate = (iso?: string) => (iso ? iso.slice(0, 10) : '')

// A listing as buyers see it in the marketplace (farmer contact details are never included)
export interface MarketListing extends Crop {
  farmer: { id: string; name: string; memberSince: string; verified: boolean }
}

export interface FarmerPublic {
  name: string
  verified: boolean
  memberSince: string
  village?: string
  district?: string
  state?: string
  activeListings: number
  rating?: { avg: number; count: number } | null
}
