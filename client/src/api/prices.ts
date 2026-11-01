import { T } from '../i18n'

export type PriceSource = 'agmarknet' | 'admin'

export const sourceLabel: Record<PriceSource, string> = {
  agmarknet: T('AGMARKNET (Govt. data)'),
  admin: T('Admin entry'),
}

export interface MarketRow {
  market: string
  district: string
  variety?: string
  minPrice: number
  modalPrice: number
  maxPrice: number
  date: string
  ageDays: number
  source: PriceSource
  distanceKm: number | null
  transportCost: number | null
  grossRevenue: number
  netRevenue: number | null
}

export interface CompareResult {
  crop: string
  quantity: number
  fromDistrict: string | null
  assumptions: { ratePerKm: number; vehicleKg: number; minTripCharge: number; freshDays: number }
  markets: MarketRow[]
  best: { market: string; netRevenue: number } | null
  newestDate: string | null
  stale: boolean | null
  platform: {
    orders: { avgPrice: number; orders: number; quantity: number } | null
    listings: { avgPrice: number; listings: number } | null
  }
}

export interface TrendPoint {
  date: string
  price: number
  markets: number
}

export interface PriceReference {
  low: number
  high: number
  median: number
  markets: number
  date: string
  sources: PriceSource[]
}
