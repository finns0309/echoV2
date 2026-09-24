// Stroke order, from KanjiVG (CC BY-SA 3.0, © Ulrich Apel; see ./strokes/NOTICE.md):
// each character's strokes as SVG paths in a 109×109 box, in the order they are
// written. The data is split by Unicode block and loaded a block at a time, from
// the app itself, when a word is to be written.
import type { Block } from '@contract'

const blocks = import.meta.glob<Record<string, string[]>>('./strokes/*.json', { import: 'default' })

/** A character's strokes in order, or null if there is no data for it. */
export async function strokesOf(char: string): Promise<string[] | null> {
  const code = char.codePointAt(0)
  if (code === undefined) return null
  const load = blocks[`./strokes/${(code >> 8).toString(16)}.json`]
  return load ? ((await load())[char] ?? null) : null
}

const MAX = 4 // characters the sheet holds
const WRITABLE = /^[ぁ-ヿ㐀-䶿一-鿿々]+$/u

/**
 * The word to write, if this card is one: a primary line with a reading, short,
 * all kana and kanji. (A word card, as an agent sends one to be learnt.)
 */
export function wordOf(blocks: readonly Block[]): string | null {
  const head = blocks.find((b): b is Extract<Block, { type: 'text' }> => b.type === 'text' && b.role === 'primary')
  if (!head?.reading) return null
  const chars = [...head.text]
  return chars.length <= MAX && WRITABLE.test(head.text) ? head.text : null
}
