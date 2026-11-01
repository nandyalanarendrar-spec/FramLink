import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import te from './te'
import hi from './hi'

// To add a language: create src/i18n/<code>.ts (same keys as te.ts), import it here and add one line to LANGS.
export const LANGS = [
  { code: 'en', label: 'EN', name: 'English', locale: 'en-IN', speech: 'en-IN' },
  { code: 'te', label: 'తె', name: 'తెలుగు', locale: 'te-IN', speech: 'te-IN' },
  { code: 'hi', label: 'हि', name: 'हिन्दी', locale: 'hi-IN', speech: 'hi-IN' },
] as const

export type Lang = (typeof LANGS)[number]['code']
const KEY = 'fl_lang'
const isLang = (v: unknown): v is Lang => LANGS.some((l) => l.code === v)

function saved(): Lang {
  try {
    const v = localStorage.getItem(KEY)
    return isLang(v) ? v : 'en'
  } catch {
    return 'en'
  }
}

// English text is the key itself (t('Dashboard')). Other languages need a dictionary only;
// anything missing from it falls back to the English text, so nothing ever shows blank.
i18n.use(initReactI18next).init({
  resources: { te: { translation: te }, hi: { translation: hi } },
  lng: saved(),
  fallbackLng: 'en',
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false },
  returnEmptyString: false,
})

document.documentElement.lang = i18n.language

export function setLanguage(lang: Lang) {
  i18n.changeLanguage(lang)
  document.documentElement.lang = lang
  try {
    localStorage.setItem(KEY, lang)
  } catch {
    /* private mode: the choice just lasts for this visit */
  }
}

/** Marks an English string that is translated later (module-level lists), e.g. label: T('Dashboard') then t(label) */
export const T = (s: string) => s

/** The active language's entry (locale for dates and numbers, speech-recognition code) */
export const currentLang = () => LANGS.find((l) => l.code === i18n.language) ?? LANGS[0]

/** Locale for dates and numbers */
export const dateLocale = () => currentLang().locale

export default i18n
