import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import {
  ArrowRight, BarChart3, BadgeCheck, CheckCircle2, Handshake, ShoppingBasket,
  Sprout, Truck,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import Logo from '../components/Logo'
import LanguageSwitcher from '../components/LanguageSwitcher'
import { homePathFor, useAuth } from '../context/AuthContext'
import { T } from '../i18n'

const features = [
  { icon: Handshake, title: T('Direct connections'), text: T('List crops, receive purchase requests and negotiate directly.') },
  { icon: BarChart3, title: T('Price comparison'), text: T('Compare markets and see estimated net revenue after transport.') },
  { icon: Truck, title: T('Transport coordination'), text: T('Find transporters and arrange pickup and delivery.') },
  { icon: BadgeCheck, title: T('Verified accounts'), text: T('Email-confirmed and admin-reviewed profiles build trust.') },
]

const audiences: { role: string; icon: LucideIcon; title: string; points: string[]; cta: string }[] = [
  { role: 'farmer', icon: Sprout, title: T('For Farmers'), points: [T('List crops with quantity and price'), T('Receive and negotiate buyer requests'), T('Compare markets before you sell')], cta: T('Register as Farmer') },
  { role: 'buyer', icon: ShoppingBasket, title: T('For Buyers'), points: [T('Search by crop, location and price'), T('Send purchase requests directly'), T('Track orders to delivery')], cta: T('Register as Buyer') },
  { role: 'transporter', icon: Truck, title: T('For Transporters'), points: [T('List your vehicle, route and charges'), T('Get delivery requests from farmers'), T('Earn from regular and shared trips')], cta: T('Register as Transporter') },
]

const steps = [
  T('Register as farmer, buyer or transporter'),
  T('Confirm your email with a one-time code'),
  T('Admin verifies your account'),
  T('List crops or search the marketplace'),
  T('Negotiate, arrange transport, confirm delivery'),
]

const trust = [T('Email-verified accounts'), T('Admin-reviewed profiles'), T('Free to join')]

export default function Landing() {
  const { t } = useTranslation()
  const { user, logout } = useAuth()
  const dash = user ? (user.emailVerified ? homePathFor(user.role) : '/verify-email') : '/login'

  return (
    <div className="bg-brand-50">
      {/* Hero: light, with a golden wheat field behind */}
      <section className="relative overflow-hidden bg-brand-50">
        <img src="/hero-field.svg" alt="" aria-hidden className="pointer-events-none absolute inset-0 h-full w-full object-cover object-bottom" />

        <header className="relative border-b border-brand-100/70 bg-white/80 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3">
            <Logo />
            <nav className="flex items-center gap-2">
              <LanguageSwitcher />
              {user ? (
                <>
                  <Link to={dash} className="btn-primary">{t('Go to dashboard')}</Link>
                  <button onClick={() => logout()} className="btn-outline">{t('Logout')}</button>
                </>
              ) : (
                <>
                  <Link to="/login" className="btn-outline">{t('Login')}</Link>
                  <Link to="/register" className="btn-primary">{t('Register')}</Link>
                </>
              )}
            </nav>
          </div>
        </header>

        <div className="relative mx-auto max-w-6xl px-4 pb-10 pt-14 text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-brand-700 shadow-sm">
            <Sprout size={14} /> {t('Smart agricultural marketplace')}
          </span>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-brand-900 sm:text-5xl">
            {t('Connecting Farmers. Empowering Agriculture.')}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg font-medium text-slate-800">
            {t('FarmLink is a marketplace where farmers find buyers, compare prices and coordinate transport, all in one platform.')}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {user ? (
              <>
                <Link to={dash} className="btn-primary gap-2 px-6 py-3">{t('Continue as {{name}}', { name: user.name })} <ArrowRight size={18} /></Link>
                <button onClick={() => logout()} className="btn-outline px-6 py-3">{t('Logout to register another account')}</button>
              </>
            ) : (
              <>
                <Link to="/register?role=farmer" className="btn-primary gap-2 px-6 py-3"><Sprout size={18} /> {t('I am a Farmer')}</Link>
                <Link to="/register?role=buyer" className="btn-outline gap-2 px-6 py-3"><ShoppingBasket size={18} /> {t('I am a Buyer')}</Link>
                <Link to="/register?role=transporter" className="btn-outline gap-2 px-6 py-3"><Truck size={18} /> {t('I am a Transporter')}</Link>
              </>
            )}
          </div>
          <ul className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm font-medium text-slate-800">
            {trust.map((x) => (
              <li key={x} className="flex items-center gap-1.5"><CheckCircle2 size={16} className="text-brand-600" />{t(x)}</li>
            ))}
          </ul>
        </div>
        <div className="relative mx-auto max-w-6xl px-4 pb-14">
          <h2 className="text-center text-xl font-bold text-brand-900">{t('What FarmLink offers')}</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map(({ icon: Icon, title, text }) => (
              <div key={title} className="rounded-xl border border-white/70 bg-white/85 p-5 shadow-sm backdrop-blur transition hover:-translate-y-1 hover:shadow-lg">
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand-100 text-brand-700"><Icon size={20} /></span>
                <h3 className="mt-3 font-semibold">{t(title)}</h3>
                <p className="mt-1 text-sm text-slate-600">{t(text)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Audiences */}
      <section className="bg-brand-100/60 py-12">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-2xl font-bold text-brand-900">{t('Built for everyone in the supply chain')}</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {audiences.map(({ role, icon: Icon, title, points, cta }) => (
              <div key={role} className="flex flex-col rounded-2xl bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-600 text-white"><Icon size={22} /></span>
                <h3 className="mt-4 text-lg font-bold">{t(title)}</h3>
                <ul className="mt-3 flex-1 space-y-2 text-sm text-slate-600">
                  {points.map((p) => (
                    <li key={p} className="flex gap-2"><BadgeCheck size={16} className="mt-0.5 shrink-0 text-brand-600" />{t(p)}</li>
                  ))}
                </ul>
                <Link to={user ? dash : `/register?role=${role}`} className="btn-primary mt-5">{user ? t('Go to dashboard') : t(cta)}</Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="text-center text-2xl font-bold text-brand-900">{t('How it works')}</h2>
        <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {steps.map((s, i) => (
            <li key={s} className="relative rounded-xl border border-brand-100 bg-white p-4">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-600 text-sm font-bold text-white">{i + 1}</span>
              <p className="mt-3 text-sm font-medium">{t(s)}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Footer */}
      <footer className="bg-brand-900 py-5 text-center text-sm text-brand-100">
        © {new Date().getFullYear()} FarmLink · {t('Connecting Farmers. Empowering Agriculture.')}
      </footer>
    </div>
  )
}
