import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Mic, Square } from 'lucide-react'
import { LANGS, currentLang } from '../i18n'
import { parseVoice } from '../utils/voice'
import type { VoiceResult } from '../utils/voice'

// The browser's built-in speech recognition (Chrome and Edge). Not in every browser, so the button hides when it is missing.
interface Recognition {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}
type RecognitionCtor = new () => Recognition

const getCtor = (): RecognitionCtor | undefined => {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

const EXAMPLE: Record<string, string> = { 'en-IN': 'Tomato 500 kg 20 rupees', 'te-IN': 'టమాటా 500 కిలోలు 20 రూపాయలు', 'hi-IN': 'टमाटर 500 किलो 20 रुपये' }

// Speak "టమాటా 500 కిలోలు 20 రూపాయలు" and the crop, quantity and price fields fill in. The farmer still checks them before saving.
export default function VoiceFill({ onResult }: { onResult: (r: VoiceResult) => void }) {
  const { t } = useTranslation()
  const [lang, setLang] = useState<string>(currentLang().speech)
  const [listening, setListening] = useState(false)
  const [heard, setHeard] = useState('')
  const [understood, setUnderstood] = useState<VoiceResult | null>(null)
  const [error, setError] = useState('')
  const rec = useRef<Recognition | null>(null)

  const Ctor = getCtor()
  if (!Ctor) return null

  function start() {
    setError('')
    setHeard('')
    setUnderstood(null)
    const r = new Ctor!()
    r.lang = lang
    r.interimResults = false
    r.maxAlternatives = 1
    r.onresult = (e) => {
      const said = e.results[0]?.[0]?.transcript ?? ''
      setHeard(said)
      const parsed = parseVoice(said)
      setUnderstood(parsed)
      if (parsed.crop || parsed.quantity || parsed.price) onResult(parsed)
    }
    r.onerror = (e) => {
      setError(
        e.error === 'not-allowed' ? t('Microphone permission was denied. Allow it in the browser address bar.')
        : e.error === 'no-speech' ? t('Did not hear anything. Tap the mic and try again.')
        : e.error === 'network' ? t('Voice needs an internet connection.')
        : t('Voice input did not work. You can type instead.')
      )
    }
    r.onend = () => setListening(false)
    rec.current = r
    setListening(true)
    r.start()
  }

  const stop = () => rec.current?.stop()
  const parts = understood
    ? [understood.crop, understood.quantity ? t('{{n}} kg', { n: understood.quantity.toLocaleString('en-IN') }) : '', understood.price ? `₹${understood.price}${t('/kg')}` : ''].filter(Boolean)
    : []

  return (
    <section className="rounded-xl border border-brand-100 bg-brand-50 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={listening ? stop : start} className={`btn-primary gap-2 ${listening ? 'animate-pulse bg-red-600 hover:bg-red-700' : ''}`}>
          {listening ? <Square size={16} /> : <Mic size={16} />} {listening ? t('Listening… tap to stop') : t('Speak to fill')}
        </button>
        <select className="input w-auto bg-white py-2 text-sm" value={lang} onChange={(e) => setLang(e.target.value)} disabled={listening} aria-label={t('Language')}>
          {LANGS.map((l) => <option key={l.code} value={l.speech}>{l.name}</option>)}
        </select>
        <p className="text-sm text-slate-600">{t('Say the crop, quantity and price, for example:')} <b>{EXAMPLE[lang] ?? EXAMPLE['en-IN']}</b></p>
      </div>
      {heard && <p className="mt-3 text-sm text-slate-600">{t('You said')}: “{heard}”</p>}
      {understood && (
        <p className={`mt-1 text-sm ${parts.length ? 'text-brand-800' : 'text-amber-700'}`}>
          {parts.length ? <>{t('Filled in')}: <b>{parts.join(' · ')}</b>. {t('Please check the fields below.')}</> : t('Could not find a crop, quantity or price in that. Try again, or type below.')}
        </p>
      )}
      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </section>
  )
}
