import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'

export default function ComingSoon() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const name = pathname.split('/').filter(Boolean).slice(1).join(' / ') || t('This page')
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <h1 className="text-xl font-bold capitalize">{name}</h1>
      <p className="mt-2 text-slate-500">{t('This module is coming in an upcoming step.')}</p>
    </div>
  )
}
