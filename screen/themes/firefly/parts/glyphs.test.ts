import { describe, expect, it } from 'vitest'
import type { Block } from '@contract'
import { inked, linesOf, wrap } from './glyphs'

const text = (t: string, at = 0, extra: Partial<Extract<Block, { type: 'text' }>> = {}): Block => ({ type: 'text', role: at ? 'secondary' : 'primary', text: t, at, ...extra })

describe('what they spell', () => {
  it('spells the line it has reached, with its reading above a primary line', () => {
    const blocks = [text('巡り合う', 0, { reading: 'めぐりあう' }), text('偶然相遇', 4)]
    expect(linesOf(blocks, 1).map((l) => ('text' in l ? l.text : l.bar))).toEqual(['めぐりあう', '巡り合う'])
    expect(linesOf(blocks, 5).map((l) => ('text' in l ? l.text : l.bar))).toEqual(['偶然相遇'])
  })

  it('spells a value as its label over the figure, and progress as a bar', () => {
    const value = linesOf([{ type: 'value', role: 'primary', value: 42.3, unit: 'MB', label: '缓存', delta: 1.8 }], 0)
    expect(value.map((l) => ('text' in l ? l.text : l.bar))).toEqual(['缓存', '42.3 MB ↑1.8'])
    const bar = linesOf([{ type: 'progress', role: 'primary', value: 3, max: 10 }], 0)
    expect(bar).toEqual([{ bar: 0.3, scale: 1, lum: 1 }])
  })
})

describe('wrapping', () => {
  const measure = (s: string) => [...s].length * 10
  it('breaks between characters, but keeps latin words whole', () => {
    expect(wrap('从树叶间洒下的阳光', measure, 50)).toEqual(['从树叶间洒', '下的阳光'])
    expect(wrap('Tests all green', measure, 100)).toEqual(['Tests all', 'green'])
  })
})

describe('sampling', () => {
  it('takes a point every step where the image is inked', () => {
    const w = 40
    const h = 20
    const data = new Uint8ClampedArray(w * h * 4)
    // Ink the left half.
    for (let y = 0; y < h; y++) for (let x = 0; x < 20; x++) data[(y * w + x) * 4 + 3] = 255
    const points = inked(data, w, h, 4)
    expect(points.length).toBeGreaterThan(15)
    expect(points.every((p) => p.x < 20)).toBe(true)
  })
})
