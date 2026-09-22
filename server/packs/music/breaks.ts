// Where a track leaves room for something else: the intro before the first
// line, long instrumental gaps, and the outro. Other content may cut in there
// (docs/CONTRACT.md §5 rule 5). An instrumental track is one long break.
import type { LyricLine } from '@server/capabilities/lyrics/service'

const MIN_BREAK_S = 8 // shorter gaps aren't worth an interruption
const LEAD_S = 1.5 // leave the stage a little before the voice comes back
const SETTLE_S = 1 // …and wait a moment after it stops
const TYPICAL_LINE_S = 6 // a line-level LRC line is "sung" this long at most

export interface Break {
  at: number
  until: number
}

/** When a line stops being sung: verbatim timing knows; otherwise estimate. */
function endOf(line: LyricLine, next: LyricLine | undefined): number {
  if (line.duration) return line.time + line.duration
  return Math.min(line.time + TYPICAL_LINE_S, next ? next.time : Infinity)
}

export function computeBreaks(lines: readonly LyricLine[], duration: number): Break[] {
  if (!lines.length) return duration > 0 ? [{ at: 0, until: duration }] : []
  const out: Break[] = []
  const push = (at: number, until: number) => {
    if (until - at >= MIN_BREAK_S - LEAD_S - SETTLE_S && until > at) out.push({ at, until })
  }
  const first = lines[0]!
  if (first.time >= MIN_BREAK_S) push(0, first.time - LEAD_S)
  lines.forEach((line, i) => {
    const next = lines[i + 1]
    const end = endOf(line, next)
    if (next && next.time - end >= MIN_BREAK_S) push(end + SETTLE_S, next.time - LEAD_S)
    if (!next && duration - end >= MIN_BREAK_S) push(end + SETTLE_S, duration)
  })
  return out
}
