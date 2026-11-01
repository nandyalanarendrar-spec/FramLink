import { useTranslation } from 'react-i18next'
import { Star } from 'lucide-react'

export interface Score {
  avg: number
  count: number
}

// "★ 4.5 (12)", or a quiet "No ratings yet"
export default function Stars({ rating, className = '' }: { rating?: Score | null; className?: string }) {
  const { t } = useTranslation()
  if (!rating) return <span className={`text-xs text-slate-400 ${className}`}>{t('No ratings yet')}</span>
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold text-slate-700 ${className}`}>
      <Star size={13} className="fill-amber-400 text-amber-400" />
      {rating.avg} <span className="font-normal text-slate-500">({rating.count})</span>
    </span>
  )
}
