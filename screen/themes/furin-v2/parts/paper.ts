// What the strip carries, from a block: a line (short enough for the strip,
// else its `short`), a figure, a bar, a picture. Everything is written down
// the strip, top to bottom. Pure.
import type { Block } from '@contract'
import { fitText, progressRatio, valueParts } from '@screen/primitives/blocks'
import { langOf } from '@screen/primitives/text'

export type PaperContent =
  | { kind: 'blank' }
  | { kind: 'text'; text: string; reading?: string; lang?: string }
  | { kind: 'value'; label?: string; number: string; unit?: string; delta?: string; lang?: string }
  | { kind: 'progress'; label?: string; ratio: number; lang?: string }
  | { kind: 'image'; src: string; alt?: string; lang?: string }

export function paperOf(block: Block, maxChars: number): PaperContent {
  const lang = langOf(block)
  const tag = lang ? { lang } : {}
  switch (block.type) {
    case 'text': {
      const text = fitText(block, maxChars)
      return { kind: 'text', text, ...(block.reading && text === block.text ? { reading: block.reading } : {}), ...tag }
    }
    case 'value': {
      const { label, number, unit, delta } = valueParts(block)
      return { kind: 'value', number, ...(label ? { label } : {}), ...(unit ? { unit } : {}), ...(delta ? { delta: delta.text } : {}), ...tag }
    }
    case 'progress':
      return { kind: 'progress', ratio: progressRatio(block), ...(block.label ? { label: block.label } : {}), ...tag }
    case 'image':
      return { kind: 'image', src: block.src, ...(block.alt ? { alt: block.alt } : {}), ...tag }
  }
}

/** The card's writing space, top to bottom, and the advance of a character there (with its tracking). */
const COLUMN_PX = 158
const ADVANCE = 1.14

/**
 * The type size for a line of `n` characters: one column down the card when it
 * fits at a readable size (17 to 12 px); past that, two columns at 13.
 */
export function sizeFor(n: number): number {
  const one = Math.floor(COLUMN_PX / (Math.max(1, n) * ADVANCE))
  return one >= 12 ? Math.min(17, one) : 13
}

/** Seconds per character as the strip is written: unhurried, a brush rather than a keyboard. */
export const PER_CHAR = 0.085
