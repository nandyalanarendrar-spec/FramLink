import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Bell, ClipboardList, Package, HandCoins, LayoutDashboard, LogOut, Menu, Sprout,
  Store, Truck, User, Users, X, LineChart, ShieldCheck, BarChart3, Flag, Search, Megaphone, ArrowLeft,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import Logo from '../components/Logo'
import LanguageSwitcher from '../components/LanguageSwitcher'
import { T } from '../i18n'
import { NotificationBell, NotificationToast } from '../components/NotificationBell'
import { useAuth } from '../context/AuthContext'
import type { Role } from '../context/AuthContext'

interface NavItem { to: string; label: string; icon: LucideIcon; end?: boolean }

const navByRole: Record<Role, NavItem[]> = {
  farmer: [
    { to: '/farmer', label: T('Dashboard'), icon: LayoutDashboard, end: true },
    { to: '/farmer/crops', label: T('My Crop Listings'), icon: Sprout },
    { to: '/farmer/wanted', label: T('Buyers Wanted'), icon: Megaphone },
    { to: '/farmer/requests', label: T('Buyer Requests'), icon: ClipboardList },
    { to: '/farmer/orders', label: T('Orders'), icon: Package },
    { to: '/farmer/prices', label: T('Price Comparison'), icon: LineChart },
    { to: '/farmer/insights', label: T('Demand & Supply'), icon: BarChart3 },
    { to: '/farmer/sales', label: T('Sales History'), icon: HandCoins },
    { to: '/farmer/vehicles', label: T('Find Vehicles'), icon: Search },
    { to: '/farmer/transport', label: T('Transport Requests'), icon: Truck },
    { to: '/farmer/notifications', label: T('Notifications'), icon: Bell },
    { to: '/farmer/profile', label: T('My Profile'), icon: User },
  ],
  buyer: [
    { to: '/buyer', label: T('Dashboard'), icon: LayoutDashboard, end: true },
    { to: '/buyer/marketplace', label: T('Marketplace'), icon: Store },
    { to: '/buyer/wanted', label: T('Wanted Crops'), icon: Megaphone },
    { to: '/buyer/insights', label: T('Demand & Supply'), icon: BarChart3 },
    { to: '/buyer/requests', label: T('My Requests'), icon: ClipboardList },
    { to: '/buyer/orders', label: T('Orders'), icon: HandCoins },
    { to: '/buyer/vehicles', label: T('Find Vehicles'), icon: Search },
    { to: '/buyer/transport', label: T('Transport Requests'), icon: Truck },
    { to: '/buyer/notifications', label: T('Notifications'), icon: Bell },
    { to: '/buyer/profile', label: T('My Profile'), icon: User },
  ],
  transporter: [
    { to: '/transporter', label: T('Dashboard'), icon: LayoutDashboard, end: true },
    { to: '/transporter/requests', label: T('Transport Requests'), icon: Truck },
    { to: '/transporter/vehicles', label: T('My Vehicles'), icon: ClipboardList },
    { to: '/transporter/notifications', label: T('Notifications'), icon: Bell },
    { to: '/transporter/profile', label: T('My Profile'), icon: User },
  ],
  admin: [
    { to: '/admin', label: T('Dashboard'), icon: LayoutDashboard, end: true },
    { to: '/admin/verifications', label: T('Verifications'), icon: ShieldCheck },
    { to: '/admin/reports', label: T('Reports'), icon: Flag },
    { to: '/admin/prices', label: T('Market prices'), icon: LineChart },
    { to: '/admin/notifications', label: T('Notifications'), icon: Bell },
    { to: '/admin/users', label: T('Users'), icon: Users },
    { to: '/admin/listings', label: T('Listings'), icon: Sprout },
  ],
}

const roleLabels: Record<Role, string> = { farmer: T('Farmer'), buyer: T('Buyer'), transporter: T('Transporter'), admin: T('Admin') }

export default function PortalLayout() {
  const { t } = useTranslation()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  if (!user) return null

  // Back goes one step in history; if this page was opened directly there is nothing to go back to, so it goes to the dashboard
  const atHome = pathname.replace(/\/$/, '') === `/${user.role}`
  const goBack = () => ((window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate(`/${user.role}`))

  const items = navByRole[user.role]

  async function onLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-screen">
      <NotificationToast />
      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-4 py-4">
          <Logo />
          <button className="lg:hidden" onClick={() => setOpen(false)} aria-label={t('Close menu')}><X size={20} /></button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3">
          {items.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'
                }`
              }
            >
              <Icon size={18} /> {t(label)}
            </NavLink>
          ))}
        </nav>
        <button onClick={onLogout} className="m-3 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
          <LogOut size={18} /> {t('Logout')}
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <div className="flex items-center gap-2">
            <button className="lg:hidden" onClick={() => setOpen(true)} aria-label={t('Open menu')}><Menu size={22} /></button>
            {!atHome && (
              <button onClick={goBack} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                <ArrowLeft size={16} /> {t('Back')}
              </button>
            )}
          </div>
          <div className="ml-auto flex items-center gap-3">
            <LanguageSwitcher />
            <NotificationBell />
            <div className="text-right">
              <p className="text-sm font-semibold">{user.name}</p>
              <p className="text-xs text-slate-500">{t(roleLabels[user.role])}</p>
            </div>
            <button onClick={onLogout} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50" aria-label={t('Logout')}>
              <LogOut size={16} /> <span className="hidden sm:inline">{t('Logout')}</span>
            </button>
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6"><Outlet /></main>
      </div>
    </div>
  )
}
