import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ArrowLeft, BadgeCheck, BarChart3, Handshake, Truck } from 'lucide-react'
import Logo from './Logo'
import LanguageSwitcher from './LanguageSwitcher'
import { T } from '../i18n'

const points = [
  { icon: Handshake, text: T('Sell directly to retailers and wholesalers') },
  { icon: BarChart3, text: T('Compare prices and estimated net revenue') },
  { icon: Truck, text: T('Book transport for pickup and delivery') },
  { icon: BadgeCheck, text: T('Trusted, admin-verified community') },
]

// Split-screen layout shared by Login, Register and Verify Email
export default function AuthShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  const { t } = useTranslation()

  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-brand-900 via-brand-700 to-brand-600 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-white/5" />
        <Logo light />
        <div className="relative">
          <h2 className="text-4xl font-extrabold leading-tight">{t('From farm to market, without the guesswork.')}</h2>
          <p className="mt-4 max-w-md text-brand-100">{t('FarmLink connects farmers, buyers and transporters on one transparent platform.')}</p>
          <ul className="mt-8 space-y-4">
            {points.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/15"><Icon size={18} /></span>
                {t(text)}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-brand-100">{t('Connecting Farmers. Empowering Agriculture.')}</p>
      </aside>

      <main className="relative grid place-items-center px-4 py-10">
        <Link to="/" className="absolute left-4 top-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800"><ArrowLeft size={16} /> {t('Back to home')}</Link>
        <LanguageSwitcher className="absolute right-4 top-4" />
        <div className={`w-full ${wide ? 'max-w-xl' : 'max-w-md'}`}>
          <div className="mb-6 lg:hidden"><Logo /></div>
          {children}
        </div>
      </main>
    </div>
  )
}
