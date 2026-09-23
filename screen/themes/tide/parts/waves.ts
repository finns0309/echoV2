// When the line waves launch. Pure scheduling, no GL. Ported from echo's tide.js.
//
// A line change is a wave whose FRONT reaches the text exactly when the next
// line starts, and never before the old line's last unit has been spoken:
// text is spoken right up to the change, so a wave cresting early would wipe
// words mid-phrase.

export const TU = 1.35 // line wave run-up, seconds
export const TB = 3.2 // line wave backwash, seconds
export const ARRIVE = 0.28 // launch → the front reaches the top of the text block
export const ARRIVE_END = 0.5 // …and has crossed the bottom of it
export const HOLD = 1.6 // how long the dragged-away streaks linger
export const MIN_WAVE_GAP = 1.9 // changes closer than this swap without a wave

export interface TimedLine {
  /** Seconds on the content timeline. */
  time: number
  text: string
  units: { time: number; duration: number; text: string }[]
  /** Picks the typeface: Japanese and Chinese draw the same kanji differently. */
  lang?: string
  /** 0..1: a progress line of light drawn under the text. */
  bar?: number
  /** Stays after it is spoken (a status): no wave comes to take it when it is the last line. */
  hold?: boolean
}

/** When the last unit of a line finishes being spoken. */
export function spokenEnd(line: TimedLine): number {
  const last = line.units[line.units.length - 1]
  return last ? last.time + last.duration : line.time
}

/** Launch times for the line waves, on the content timeline. */
export function scheduleWaves(lines: readonly TimedLine[]): number[] {
  const out: number[] = []
  let lastAt = -99
  lines.forEach((line, i) => {
    const next = lines[i + 1]
    if (!next && line.hold) return
    const changeAt = next ? next.time : spokenEnd(line) + 0.6
    // the front clears the block by the change, but never touches it before the last unit is spoken
    const at = Math.min(Math.max(changeAt - ARRIVE_END, spokenEnd(line) - ARRIVE), changeAt + 0.25 - ARRIVE)
    if (at - lastAt < MIN_WAVE_GAP || at < 0.2) return // too dense → plain swap
    out.push(at)
    lastAt = at
  })
  return out
}
