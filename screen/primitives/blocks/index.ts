// Block helpers every text-first theme needs: which block is "current" at a
// local time, and how any block reads as one line of text.
import type { Block, OnAir, Presentation, Salience } from '@contract'

/** Any block as a single line of text: the universal fallback (CONTRACT §3.4). */
export function toText(block: Block): string {
  switch (block.type) {
    case 'text':
      return block.text
    case 'value': {
      const { label, number, unit, delta } = valueParts(block)
      return [label, `${number}${unit ? ` ${unit}` : ''}${delta ? ` ${delta.text}` : ''}`].filter(Boolean).join(' · ')
    }
    case 'progress':
      return [block.label, `${Math.round(progressRatio(block) * 100)}%`].filter(Boolean).join(' · ')
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

/** How loud what's on air should look; the stage resolves it, older states default to normal. */
export function salienceOf(onAir: OnAir): Salience {
  return onAir.salience ?? onAir.presentation.hints?.salience ?? 'normal'
}

/** A progress block as 0..1. */
export function progressRatio(block: Extract<Block, { type: 'progress' }>): number {
  return Math.max(0, Math.min(1, block.value / block.max))
}

export interface ValueParts {
  label?: string
  /** The number as it should read: grouped, at most two decimals. */
  number: string
  unit?: string
  delta?: { dir: 'up' | 'down' | 'flat'; text: string }
}

const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

/** A value block in parts a theme can set in different sizes. */
export function valueParts(block: Extract<Block, { type: 'value' }>): ValueParts {
  const number = typeof block.value === 'number' ? numberFormat.format(block.value) : block.value
  const d = block.delta
  return {
    number,
    ...(block.label ? { label: block.label } : {}),
    ...(block.unit ? { unit: block.unit } : {}),
    ...(d === undefined
      ? {}
      : { delta: { dir: d > 0 ? 'up' : d < 0 ? 'down' : 'flat', text: `${d > 0 ? '↑' : d < 0 ? '↓' : '·'}${numberFormat.format(Math.abs(d))}` } }),
  }
}

