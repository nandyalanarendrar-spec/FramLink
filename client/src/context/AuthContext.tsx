import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { api } from '../api/client'

export type Role = 'farmer' | 'buyer' | 'transporter' | 'admin'
export type VerificationStatus = 'pending' | 'verified' | 'rejected'

export interface User {
  id: string
  name: string
  phone: string
  email: string
  role: Role
  emailVerified: boolean
  verificationStatus: VerificationStatus
  rejectionReason?: string
  /** true once the user has submitted verification details from the Profile page */
  detailsSubmitted: boolean
}

export interface RegisterInput {
  name: string
  phone: string
  email: string
  password: string
  role: Exclude<Role, 'admin'>
  district?: string
  village?: string
  buyerType?: 'retailer' | 'wholesaler' | 'consumer'
  businessName?: string
  vehicleType?: string
  vehicleNumber?: string
  vehicleCapacityKg?: number
}

interface AuthState {
  user: User | null
  loading: boolean
  /** Only set in local dev when SMTP is not configured on the server */
  devOtp?: string
  /** The server could not send the verification email (mail service problem) */
  mailFailed?: boolean
  login: (identifier: string, password: string) => Promise<User>
  register: (data: RegisterInput) => Promise<User>
  verifyEmail: (otp: string) => Promise<User>
  resendOtp: () => Promise<void>
  logout: () => Promise<void>
  /** Re-fetch the current user (e.g. after submitting verification details) */
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export const homePathFor = (role: Role) => `/${role}`

/** Where a logged-in user should land: verify email first, then their portal */
export const landingPathFor = (u: User) => (u.emailVerified ? homePathFor(u.role) : '/verify-email')

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [devOtp, setDevOtp] = useState<string>()
  const [mailFailed, setMailFailed] = useState(false)

  const loadMe = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/me')
      setUser(data.user)
    } catch {
      setUser(null)
    }
  }, [])

  // Restore session from the httpOnly cookie on first load
  useEffect(() => {
    loadMe().finally(() => setLoading(false))
  }, [loadMe])

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      devOtp,
      mailFailed,
      async login(identifier, password) {
        const { data } = await api.post('/auth/login', { identifier, password })
        setUser(data.user)
        return data.user as User
      },
      async register(input) {
        const { data } = await api.post('/auth/register', input)
        setDevOtp(data.devOtp)
        setMailFailed(data.emailSent === false)
        setUser(data.user)
        return data.user as User
      },
      async verifyEmail(otp) {
        const { data } = await api.post('/auth/verify-email', { otp })
        setDevOtp(undefined)
        setMailFailed(false)
        setUser(data.user)
        return data.user as User
      },
      async resendOtp() {
        const { data } = await api.post('/auth/resend-otp')
        setDevOtp(data.devOtp)
        setMailFailed(data.emailSent === false)
      },
      refresh: loadMe,
      async logout() {
        await api.post('/auth/logout')
        setUser(null)
        setDevOtp(undefined)
        setMailFailed(false)
      },
    }),
    [user, loading, devOtp, mailFailed, loadMe],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
