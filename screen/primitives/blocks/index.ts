// Block helpers every text-first theme needs: which block is "current" at a
// local time, and how any block reads as one line of text.
import type { Block, Presentation } from '@contract'

/** Any block as a single line of text: the universal fallback (CONTRACT §3.4). */
export function toText(block: Block): string {
  switch (block.type) {
    case 'text':
      return block.text
    case 'value':
      return [block.label, `${block.value}${block.unit ? ` ${block.unit}` : ''}`].filter(Boolean).join(' · ')
    case 'progress':
      return [block.label, `${block.value}/${block.max}`].filter(Boolean).join(' · ')
    case 'image':
      return block.alt ?? ''
  }
}

const startOf = (b: Block) => (b.type === 'text' ? (b.at ?? 0) : 0)
const endOf = (b: Block) => (b.type === 'text' ? b.until : undefined)

/**
 * Index of the block that should be showing at local time `t` (seconds): the
 * latest one that has started and not ended. Untimed content shows its first
 * block. Returns -1 before the first block starts.
 */
export function activeBlockIndex(p: Presentation, t: number | undefined): number {
  if (t === undefined) return p.blocks.length ? 0 : -1
  let active = -1
  p.blocks.forEach((b, i) => {
    if (startOf(b) <= t && (endOf(b) === undefined || t < endOf(b)!)) active = i
  })
  return active
}

/** The text a block should show in a space that fits `maxChars` characters. */
export function fitText(block: Block, maxChars?: number): string {
  const full = toText(block)
  if (!maxChars || [...full].length <= maxChars) return full
  return block.type === 'text' && block.short ? block.short : full
}
