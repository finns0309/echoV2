// What the page says by itself: the greeting on an empty page, and the verb
// the spark wears while it thinks or listens. Pure.
import { hash } from '@screen/primitives/text'

/** The greeting on an empty page, by the hour (and two days of the week). */
export function greeting(d: Date): string {
  const h = d.getHours()
  const day = d.getDay()
  if (h >= 5 && h < 12) return day === 1 ? 'Happy Monday' : d.getDate() % 2 ? 'Good morning' : 'Coffee and Claude time?'
  if (h >= 12 && h < 18) return day === 5 ? 'Happy Friday' : 'Good afternoon'
  if (h >= 18 && h < 23) return 'Good evening'
  return 'Hello, night owl'
}

/** While it thinks, before a word is written. */
export const THINKING = [
  'Pondering',
  'Noodling',
  'Percolating',
  'Ruminating',
  'Cogitating',
  'Mulling',
  'Simmering',
  'Brewing',
  'Clauding',
  'Marinating',
  'Puzzling',
  'Wondering',
  'Synthesizing',
  'Contemplating',
] as const

/** Between the lines of what plays. */
export const LISTENING = ['Listening', 'Humming', 'Vibing', 'Grooving', 'Swaying', 'Tapping along'] as const

/** One of `words` for `seed`: the same thing always thinks with the same verb. */
export function pick(words: readonly string[], seed: string): string {
  return words[Math.abs(hash(seed)) % words.length]!
}
