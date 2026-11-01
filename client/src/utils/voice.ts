// Turns what a farmer says ("టమాటా 500 కిలోలు 20 రూపాయలు") into listing fields.
// Plain rules, no AI: a crop word, a number followed by a weight unit, a number followed by rupees.

export interface VoiceResult {
  crop?: string
  category?: string
  quantity?: number // kg
  price?: number // ₹ per kg
}

interface CropWord {
  en: string
  category: string
  words: string[]
}

// Telugu and English names. The longest matching word wins (వేరుశనగ must beat శనగ).
const CROPS: CropWord[] = [
  { en: 'Tomato', category: 'vegetable', words: ['టమాటా', 'టమాట', 'టమోటా', 'టమోటో', 'టొమాటో', 'tomato', 'टमाटर'] },
  { en: 'Onion', category: 'vegetable', words: ['ఉల్లిపాయ', 'ఉల్లి', 'onion', 'प्याज', 'प्याज़'] },
  { en: 'Potato', category: 'vegetable', words: ['బంగాళదుంప', 'బంగాళాదుంప', 'ఆలుగడ్డ', 'potato', 'आलू'] },
  { en: 'Brinjal', category: 'vegetable', words: ['వంకాయ', 'brinjal', 'eggplant', 'बैंगन'] },
  { en: 'Okra', category: 'vegetable', words: ['బెండకాయ', 'బెండ', 'okra', 'lady finger', 'ladyfinger', 'भिंडी'] },
  { en: 'Cabbage', category: 'vegetable', words: ['క్యాబేజీ', 'క్యాబేజ్', 'cabbage', 'पत्ता गोभी', 'पत्तागोभी'] },
  { en: 'Cauliflower', category: 'vegetable', words: ['కాలీఫ్లవర్', 'cauliflower', 'फूलगोभी', 'फूल गोभी'] },
  { en: 'Carrot', category: 'vegetable', words: ['క్యారెట్', 'carrot', 'गाजर'] },
  { en: 'Cucumber', category: 'vegetable', words: ['దోసకాయ', 'cucumber', 'खीरा'] },
  { en: 'Coriander', category: 'vegetable', words: ['కొత్తిమీర', 'coriander', 'धनिया'] },
  { en: 'Banana', category: 'fruit', words: ['అరటి', 'banana', 'केला'] },
  { en: 'Mango', category: 'fruit', words: ['మామిడి', 'mango', 'आम'] },
  { en: 'Papaya', category: 'fruit', words: ['బొప్పాయి', 'papaya', 'पपीता'] },
  { en: 'Guava', category: 'fruit', words: ['జామ', 'guava', 'अमरूद'] },
  { en: 'Pomegranate', category: 'fruit', words: ['దానిమ్మ', 'pomegranate', 'अनार'] },
  { en: 'Watermelon', category: 'fruit', words: ['పుచ్చకాయ', 'watermelon', 'तरबूज'] },
  { en: 'Lemon', category: 'fruit', words: ['నిమ్మ', 'lemon', 'नींबू'] },
  { en: 'Paddy', category: 'grain', words: ['వరి', 'ధాన్యం', 'paddy', 'धान'] },
  { en: 'Rice', category: 'grain', words: ['బియ్యం', 'rice', 'चावल'] },
  { en: 'Maize', category: 'grain', words: ['మొక్కజొన్న', 'maize', 'corn', 'मक्का'] },
  { en: 'Red gram', category: 'pulse', words: ['కందులు', 'కంది', 'red gram', 'pigeon pea', 'अरहर', 'तूर'] },
  { en: 'Green gram', category: 'pulse', words: ['పెసలు', 'పెసర', 'green gram', 'moong', 'मूंग'] },
  { en: 'Black gram', category: 'pulse', words: ['మినుములు', 'మినుము', 'black gram', 'urad', 'उड़द'] },
  { en: 'Bengal gram', category: 'pulse', words: ['శనగలు', 'శనగ', 'bengal gram', 'chickpea', 'चना'] },
  { en: 'Chilli', category: 'spice', words: ['మిరపకాయ', 'మిరప', 'మిర్చి', 'chilli', 'chili', 'मिर्च'] },
  { en: 'Turmeric', category: 'spice', words: ['పసుపు', 'turmeric', 'हल्दी'] },
  { en: 'Ginger', category: 'spice', words: ['అల్లం', 'ginger', 'अदरक'] },
  { en: 'Garlic', category: 'spice', words: ['వెల్లుల్లి', 'garlic', 'लहसुन'] },
  { en: 'Groundnut', category: 'other', words: ['వేరుశనగ', 'వేరుశెనగ', 'groundnut', 'peanut', 'मूंगफली'] },
  { en: 'Cotton', category: 'other', words: ['పత్తి', 'cotton', 'कपास'] },
  { en: 'Sunflower', category: 'other', words: ['పొద్దుతిరుగుడు', 'sunflower', 'सूरजमुखी'] },
  { en: 'Sugarcane', category: 'other', words: ['చెరకు', 'sugarcane', 'गन्ना'] },
]

const TELUGU_DIGITS = '౦౧౨౩౪౫౬౭౮౯'
const HINDI_DIGITS = '०१२३४५६७८९'

// Spoken numbers, Telugu and English. Hundreds and thousands multiply what came before them.
const ONES: Record<string, number> = {
  ఒకటి: 1, ఒక: 1, రెండు: 2, మూడు: 3, నాలుగు: 4, ఐదు: 5, ఆరు: 6, ఏడు: 7, ఎనిమిది: 8, తొమ్మిది: 9, పది: 10,
  एक: 1, दो: 2, तीन: 3, चार: 4, पांच: 5, पाँच: 5, छह: 6, छः: 6, सात: 7, आठ: 8, नौ: 9, दस: 10, बीस: 20, तीस: 30, चालीस: 40, पचास: 50, साठ: 60, सत्तर: 70, अस्सी: 80, नब्बे: 90,
  పదకొండు: 11, పన్నెండు: 12, పదిహేను: 15, ఇరవై: 20, ముప్పై: 30, నలభై: 40, యాభై: 50, అరవై: 60, డెబ్బై: 70, ఎనభై: 80, తొంభై: 90,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
}
const isHundred = (w: string) => w.startsWith('వంద') || w.startsWith('నూరు') || w === 'hundred' || w === 'सौ'
const isThousand = (w: string) => w.startsWith('వెయ్య') || w.startsWith('వేల') || w === 'thousand' || w === 'हजार' || w === 'हज़ार'

const KG = ['కిలో', 'కేజీ', 'kg', 'kilo', 'kilogram', 'किलो', 'केजी']
const QUINTAL = ['క్వింటా', 'quintal', 'क्विंटल', 'क्विन्टल']
const TON = ['టన్', 'ton', 'टन']
const RUPEE = ['రూపాయ', 'రూ', '₹', 'rs', 'rupee', 'रुपये', 'रुपया', 'रुपए', 'रू']
const PRICE_WORD = ['రేటు', 'ధర', 'price', 'rate', 'भाव', 'दाम', 'रेट', 'कीमत']

const startsWithAny = (w: string, list: string[]) => list.some((p) => w.startsWith(p))

type Tok = { kind: 'num'; value: number } | { kind: 'word'; w: string }

function tokenize(text: string): Tok[] {
  const cleaned = text
    .toLowerCase()
    .replace(/[౦-౯]/g, (d) => String(TELUGU_DIGITS.indexOf(d)))
    .replace(/[०-९]/g, (d) => String(HINDI_DIGITS.indexOf(d)))
    .replace(/(\d),(?=\d{3})/g, '$1') // 1,000 -> 1000
    .replace(/₹/g, ' ₹ ')
    .replace(/[.,;!?]+(?=\s|$)/g, ' ')
  const raw = cleaned.split(/\s+/).filter(Boolean)

  const out: Tok[] = []
  for (let i = 0; i < raw.length; i++) {
    const w = raw[i]
    if (/^\d+(\.\d+)?$/.test(w)) {
      out.push({ kind: 'num', value: Number(w) })
    } else if (w in ONES || isHundred(w) || isThousand(w)) {
      // merge a run of number words: "ఐదు వందల యాభై" = 550
      let total = 0
      let current = 0
      let j = i
      for (; j < raw.length; j++) {
        const x = raw[j]
        if (x in ONES) current += ONES[x]
        else if (isHundred(x)) current = (current || 1) * 100
        else if (isThousand(x)) { total += (current || 1) * 1000; current = 0 }
        else break
      }
      out.push({ kind: 'num', value: total + current })
      i = j - 1
    } else {
      out.push({ kind: 'word', w })
    }
  }
  return out
}

export function parseVoice(text: string): VoiceResult {
  const result: VoiceResult = {}
  const lower = text.toLowerCase()

  // Crop: the longest matching word across all crops
  let best = 0
  for (const c of CROPS) {
    for (const w of c.words) {
      const short = w.length <= 3 && /[ऀ-ॿ]/.test(w)
      const hit = short ? lower.split(/\s+/).includes(w) : lower.includes(w)
      if (w.length > best && hit) {
        best = w.length
        result.crop = c.en
        result.category = c.category
      }
    }
  }

  const toks = tokenize(text)
  const loose: number[] = [] // numbers that no unit claimed
  toks.forEach((t, i) => {
    if (t.kind !== 'num') return
    const next = toks[i + 1]?.kind === 'word' ? (toks[i + 1] as { w: string }).w : ''
    const prev = toks[i - 1]?.kind === 'word' ? (toks[i - 1] as { w: string }).w : ''
    if (startsWithAny(next, RUPEE) || startsWithAny(prev, RUPEE) || startsWithAny(prev, PRICE_WORD)) {
      if (result.price === undefined) result.price = t.value
    } else if (startsWithAny(next, QUINTAL)) {
      result.quantity ??= t.value * 100
    } else if (startsWithAny(next, TON)) {
      result.quantity ??= t.value * 1000
    } else if (startsWithAny(next, KG)) {
      result.quantity ??= t.value
    } else {
      loose.push(t.value)
    }
  })

  // "tomato 500 20": first loose number is the quantity, second the price
  if (result.quantity === undefined && loose.length) result.quantity = loose.shift()
  if (result.price === undefined && loose.length) result.price = loose.shift()
  return result
}
