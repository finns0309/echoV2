import { describe, expect, it } from 'vitest'
import type { Block } from '@contract'
import { schedule, unitsOf, writtenBy } from './stream'

const text = (t: string, at = 0, extra: Partial<Extract<Block, { type: 'text' }>> = {}): Block => ({ type: 'text', role: at ? 'secondary' : 'primary', text: t, at, ...extra })

describe('units', () => {
  it('writes a CJK character or a latin word at a time, latin words a little slower', () => {
    const u = unitsOf('Ship it 吧')
    expect(u.map((x) => x.text)).toEqual(['Ship ', 'it ', '吧'])
    expect(u.map((x) => x.at)).toEqual([0, 0.07, 0.14])
  })

  it('marks the units inside the emphasis', () => {
    const u = unitsOf('可以有很多个故乡', '很多个')
    expect(u.filter((x) => x.em).map((x) => x.text)).toEqual(['很', '多', '个'])
  })

  it('counts what is written by a moment into the block', () => {
    const u = unitsOf('巡り合う')
    expect([-0.1, 0, 0.05, 1].map((s) => writtenBy(u, s))).toEqual([0, 1, 2, 4])
  })
})

describe('schedule', () => {
  it('holds everything back while it thinks, then waits for each at', () => {
    const [a, b] = schedule([text('巡り合う'), text('偶然相遇', 4)], 1.4)
    expect(a!.start).toBe(1.4)
    expect(b!.start).toBe(5.4)
  })

  it('never starts a block before the one above it has finished', () => {
    const [a, b] = schedule([text('一二三四五六七八九十'), text('后', 0)], 0)
    expect(b!.start).toBeGreaterThan(a!.end)
  })

  it('writes a figure whole, after the text before it', () => {
    const [, v] = schedule([text('缓存'), { type: 'value', role: 'secondary', value: 42 }], 0)
    expect(v!.units).toEqual([])
    expect(v!.end - v!.start).toBeCloseTo(0.35)
  })

  it('starts lines added while on air from now, not from their at', () => {
    const t = schedule([text('一'), text('二', 1)], 0, { from: 1, notBefore: 9 })
    expect(t[0]!.start).toBe(0)
    expect(t[1]!.start).toBe(9)
  })
})
