// When each word of a reply is written. Text arrives the way Claude streams it:
// a CJK character or a latin word at a time, quickly, one block after another,
// each no earlier than its `at`. Figures, bars and pictures arrive whole. Pure.
import type { Block } from '@contract'
import { synthUnits } from '@screen/primitives/text'

/** Seconds per CJK character, and per latin word. */
const PER_CHAR = 0.045
const PER_WORD = 0.07
/** A block that arrives whole takes this long to settle. */
const WHOLE = 0.35
/** Between one block finishing and the next starting. */
const GAP = 0.15

export interface Unit {
  text: string
  /** Seconds after its block starts. */
  at: number
  /** Inside the block's emphasis. */
  em: boolean
}

export interface Timed {
  /** Seconds on the card's clock. */
  start: number
  end: number
  /** Empty for blocks that arrive whole. */
  units: Unit[]
}

const isWord = (u: string) => /[A-Za-z0-9]/.test(u)

/** A text's units, each with when it is written, and whether it is emphasised. */
export function unitsOf(text: string, emphasis?: string): Unit[] {
  const from = emphasis ? text.indexOf(emphasis) : -1
  const to = from < 0 ? -1 : from + [...emphasis!].length
  let offset = 0
  let at = 0
  return synthUnits(text).map((u) => {
    const len = [...u].length
    const unit = { text: u, at, em: from >= 0 && offset < to && offset + len > from }
    offset += len
    at += u.trim() ? (isWord(u) ? PER_WORD : PER_CHAR) : 0
    return unit
  })
}

const lengthOf = (units: readonly Unit[]) => {
  const last = units.at(-1)
  return last ? last.at + (isWord(last.text) ? PER_WORD : PER_CHAR) : WHOLE
}

export interface ScheduleOptions {
  /** Blocks from this index on start no earlier than `notBefore` (added while on air). */
  from?: number
  notBefore?: number
}

/**
 * When each block is written, on the card's clock. `delay` holds everything
 * back (the spark thinks first); a block waits for its `at` and for the one
 * before it to finish.
 */
export function schedule(blocks: readonly Block[], delay: number, { from = Infinity, notBefore = 0 }: ScheduleOptions = {}): Timed[] {
  let prevEnd = -Infinity
  return blocks.map((b, i) => {
    const at = (b.type === 'text' ? (b.at ?? 0) : 0) + delay
    let start = Math.max(at, prevEnd + GAP)
    if (i >= from) start = Math.max(start, notBefore)
    const units = b.type === 'text' ? unitsOf(b.text, b.emphasis) : []
    const end = start + lengthOf(units)
    prevEnd = end
    return { start, end, units }
  })
}

/** How many of `units` are written `elapsed` seconds into their block. */
export function writtenBy(units: readonly Unit[], elapsed: number): number {
  let n = 0
  while (n < units.length && units[n]!.at <= elapsed) n++
  return n
}
