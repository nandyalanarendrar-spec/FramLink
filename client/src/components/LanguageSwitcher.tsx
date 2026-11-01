import { useTranslation } from 'react-i18next'
import { Languages } from 'lucide-react'
import { LANGS, setLanguage } from '../i18n'

// Small EN | తె | हि toggle, built from the language list. The choice is remembered on this device.
export default function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { i18n } = useTranslation()
  return (
    <div className={`inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5 ${className}`} role="group" aria-label="Language">
      <Languages size={14} className="ml-1.5 text-slate-400" aria-hidden />
      {LANGS.map((l) => (
        <button
          key={l.code}
          type="button"
          title={l.name}
          aria-pressed={i18n.language === l.code}
          onClick={() => setLanguage(l.code)}
          className={`rounded-md px-2 py-1 text-xs font-bold transition ${i18n.language === l.code ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
        >
          {l.label}
        </button>
      ))}
    </div>
  )
}
