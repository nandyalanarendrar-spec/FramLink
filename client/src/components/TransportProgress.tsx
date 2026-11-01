import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import { dateLocale } from '../i18n'

interface Props {
  status: string
  timeline?: { status: string; at: string }[]
  paymentStatus?: 'pending' | 'paid'
  paidAt?: string
}

// Accepted → Picked up → Delivered → Paid, each with the time it happened
export default function TransportProgress({ status, timeline = [], paymentStatus, paidAt }: Props) {
  const { t } = useTranslation()
  const at = (s: string) => timeline.find((e) => e.status === s)?.at
  const steps: { label: string; done: boolean; when?: string }[] = [
    { label: t('Accepted'), done: ['accepted', 'picked_up', 'delivered'].includes(status), when: at('accepted') },
    { label: t('Picked up'), done: ['picked_up', 'delivered'].includes(status), when: at('picked_up') },
    { label: t('Delivered'), done: status === 'delivered', when: at('delivered') },
    { label: paymentStatus === 'paid' ? t('Payment received') : t('Payment pending'), done: paymentStatus === 'paid', when: paidAt },
  ]
  const fmt = (d?: string) => (d ? new Date(d).toLocaleString(dateLocale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '')
  return (
    <ol className="mt-3 grid grid-cols-4 gap-1 text-center">
      {steps.map((s, i) => (
        <li key={i} className="flex flex-col items-center gap-1">
          <span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-bold ${s.done ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-500'}`}>{s.done ? <Check size={13} /> : i + 1}</span>
          <span className={`text-[11px] leading-tight ${s.done ? 'font-semibold text-slate-700' : 'text-slate-400'}`}>{s.label}</span>
          {s.when && <span className="text-[10px] text-slate-400">{fmt(s.when)}</span>}
        </li>
      ))}
    </ol>
  )
}
