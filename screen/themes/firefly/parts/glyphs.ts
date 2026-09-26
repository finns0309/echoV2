// What the fireflies spell, and how a line of type becomes points for them to
// hold. Pure, so it is tested; parts/letters.ts does the drawing.
import type { Block } from '@contract'
import { progressRatio, valueParts } from '@screen/primitives/blocks'
import { tokenize } from '@screen/primitives/text/segment'

type Text = Extract<Block, { type: 'text' }>

/** A line of the formation: type at a relative size, or a bar filled to a ratio. */
export type Line = { text: string; scale: number; lum: number } | { bar: number; scale: number; lum: number }

/**
 * The lines for what is on: a value (label over the figure), a progress bar
 * (label over the bar), or the text line it has reached by `t`, with its reading
 * above it when it has one.
 */
export function linesOf(blocks: readonly Block[], t: number): Line[] {
  const value = blocks.find((b) => b.type === 'value')
  if (value?.type === 'value') {
    const v = valueParts(value)
    const figure = `${v.number}${v.unit ? ` ${v.unit}` : ''}${v.delta ? ` ${v.delta.text}` : ''}`
    return [...(v.label ? [{ text: v.label, scale: 0.5, lum: 0.7 }] : []), { text: figure, scale: 1.15, lum: 1 }]
  }
  const progress = blocks.find((b) => b.type === 'progress')
  if (progress?.type === 'progress') {
    return [...(progress.label ? [{ text: progress.label, scale: 0.5, lum: 0.7 }] : []), { bar: progressRatio(progress), scale: 1, lum: 1 }]
  }
  const texts = blocks.filter((b): b is Text => b.type === 'text' && (b.at ?? 0) <= t)
  const line = texts.at(-1)
  if (!line) return []
  return [...(line.reading && line.role === 'primary' ? [{ text: line.reading, scale: 0.5, lum: 0.75 }] : []), { text: line.text, scale: 1, lum: 1 }]
}

/** Break a line to fit `max` wide: latin words stay whole, anything else breaks between characters. */
export function wrap(text: string, measure: (s: string) => number, max: number): string[] {
  const rows: string[] = []
  let row = ''
  for (const tok of tokenize(text)) {
    const next = row + tok.text
    if (row && measure(next) > max) {
      rows.push(row.trimEnd())
      row = tok.type === 'space' ? '' : tok.text
    } else row = next
  }
  if (row.trim()) rows.push(row.trimEnd())
  return rows
}

/**
 * The inked pixels of an RGBA image, one point every `step` px, every other row
 * shifted by half a step so the dots sit like a honeycomb rather than a grid.
 */
export function inked(data: Uint8ClampedArray, width: number, height: number, step: number): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = []
  let row = 0
  for (let y = step / 2; y < height; y += step * 0.87, row++) {
    for (let x = row % 2 ? step : step / 2; x < width; x += step) {
      const alpha = data[(Math.floor(y) * width + Math.floor(x)) * 4 + 3]!
      if (alpha > 110) points.push({ x, y })
    }
  }
  return points
}
