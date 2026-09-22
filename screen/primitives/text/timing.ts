// Per-unit timing for themes that write text as it is "spoken". A block's own
// `timing` wins (e.g. verbatim karaoke timing); otherwise it is synthesized:
// the first 70% of the time until the next block is spread across the units,
// weighted by length, and the last 30% is a tail. Ported from echo's lrc.js.
import type { Block } from '@contract'

export interface TimedUnit {
  /** Seconds on the content's timeline. */
  time: number
  duration: number
  text: string
}

const DEFAULT_SPAN_S = 4
const SPEAK_SHARE = 0.7
const MIN_SPAN_S = 0.4

/** A latin word (with its trailing space) is one unit; every other codepoint is its own. */
export function synthUnits(text: string): string[] {
  const units: string[] = []
  let buf = ''
  for (const c of [...text]) {
    if (/[A-Za-z0-9’'-]/.test(c)) buf += c
    else if (c === ' ') {
      if (buf) {
        units.push(buf + ' ')
        buf = ''
      } else units.push(' ')
    } else {
      if (buf) {
        units.push(buf)
        buf = ''
      }
      units.push(c)
    }
  }
  if (buf) units.push(buf)
  return units
}

/**
 * Timed units for a text block. `nextAt` is when the following block starts
 * (on the same timeline); without one, the block is given DEFAULT_SPAN_S.
 */
export function timedUnits(block: Block, nextAt?: number): TimedUnit[] {
  if (block.type !== 'text') return []
  const start = block.at ?? 0
  const end = block.until ?? nextAt ?? start + DEFAULT_SPAN_S
  const chars = [...block.text]

  if (block.timing?.length) {
    const out: TimedUnit[] = []
    let cursor = 0
    block.timing.forEach((u, i) => {
      const next = block.timing![i + 1]
      const time = start + u.at
      out.push({
        time,
        duration: Math.max(0.05, (next ? start + next.at : end) - time),
        text: chars.slice(cursor, cursor + u.len).join(''),
      })
      cursor += u.len
    })
    return out
  }

  const units = synthUnits(block.text)
  if (!units.length) return []
  const span = Math.max(MIN_SPAN_S, (end - start) * SPEAK_SHARE)
  const weights = units.map((u) => Math.max(1, [...u].length))
  const total = weights.reduce((a, b) => a + b, 0)
  let acc = 0
  return units.map((text, i) => {
    const duration = (span * weights[i]!) / total
    const unit = { time: start + acc, duration, text }
    acc += duration
    return unit
  })
}
