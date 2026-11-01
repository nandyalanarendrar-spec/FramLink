// Checks the voice parser on sample sentences. Run: npm run voice:check
import assert from 'node:assert/strict'
import { parseVoice } from '../src/utils/voice.ts'

const cases = [
  ['టమాటా 500 కిలోలు 20 రూపాయలు', { crop: 'Tomato', category: 'vegetable', quantity: 500, price: 20 }],
  ['ఉల్లిపాయ రెండు క్వింటాళ్లు కిలో 15 రూపాయలు', { crop: 'Onion', category: 'vegetable', quantity: 200, price: 15 }],
  ['tomato 2 tons rate 18', { crop: 'Tomato', category: 'vegetable', quantity: 2000, price: 18 }],
  ['వేరుశనగ 1000 కిలోలు ధర 60', { crop: 'Groundnut', category: 'other', quantity: 1000, price: 60 }],
  ['మిరపకాయ ఐదు వందల కిలోలు 90 రూపాయలు', { crop: 'Chilli', category: 'spice', quantity: 500, price: 90 }],
  ['టమాటా ౫౦౦ కిలోలు', { crop: 'Tomato', category: 'vegetable', quantity: 500 }],
  ['అరటి 3000 కిలోలు', { crop: 'Banana', category: 'fruit', quantity: 3000 }],
  ['మొక్కజొన్న 25 క్వింటాళ్లు 22 రూపాయలు', { crop: 'Maize', category: 'grain', quantity: 2500, price: 22 }],
  ['బంగాళదుంప రెండు వేల కిలోలు ₹ 18', { crop: 'Potato', category: 'vegetable', quantity: 2000, price: 18 }],
  ['onion 800 kg 12 rupees', { crop: 'Onion', category: 'vegetable', quantity: 800, price: 12 }],
  ['tomato 500 20', { crop: 'Tomato', category: 'vegetable', quantity: 500, price: 20 }],
  ['టమాటా 500 కిలోలు 20 రూపాయలు', { crop: 'Tomato', category: 'vegetable', quantity: 500, price: 20 }],
  ['टमाटर 500 किलो 20 रुपये', { crop: 'Tomato', category: 'vegetable', quantity: 500, price: 20 }],
  ['प्याज दो क्विंटल भाव 15', { crop: 'Onion', category: 'vegetable', quantity: 200, price: 15 }],
  ['आलू दो हजार किलो 18 रुपये', { crop: 'Potato', category: 'vegetable', quantity: 2000, price: 18 }],
  ['मक्का 25 क्विंटल 22 रुपये', { crop: 'Maize', category: 'grain', quantity: 2500, price: 22 }],
  ['आम 300 किलो', { crop: 'Mango', category: 'fruit', quantity: 300 }],
  ['मूंगफली ५०० किलो ६० रुपये', { crop: 'Groundnut', category: 'other', quantity: 500, price: 60 }],
  ['आमतौर पर बारिश होती है', {}],
  ['హలో ఎలా ఉన్నారు', {}],
]

let failed = 0
for (const [said, want] of cases) {
  try {
    assert.deepEqual(parseVoice(said), want)
  } catch (e) {
    failed++
    console.error(`FAIL  "${said}"\n  got  ${JSON.stringify(parseVoice(said))}\n  want ${JSON.stringify(want)}`)
  }
}
console.log(failed ? `${failed} of ${cases.length} failed` : `all ${cases.length} voice sentences parsed correctly`)
process.exit(failed ? 1 : 0)
