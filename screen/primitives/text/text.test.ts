import { describe, expect, it } from 'vitest'
import { pickKeyword, segment, synthUnits, timedUnits } from './index'

describe('segment', () => {
  it('keeps Japanese words whole', () => {
    const words = segment('旅先で旧友に巡り合う').filter((s) => s.word).map((s) => s.text)
    expect(words).toContain('旅先')
    expect(words).toContain('旧友')
  })
  it('glues latin runs split on punctuation', () => {
    expect(segment("don't stop").map((s) => s.text)).toContain("don't")
  })
  it('reports codepoint positions', () => {
    const s = segment('星の夜')
    expect(s.map((x) => x.start)).toEqual([0, 1, 2].slice(0, s.length))
  })
})

describe('pickKeyword', () => {
  it('uses the block emphasis when it is in the text', () => {
    expect(pickKeyword('旅先で旧友に巡り合う', '巡り合う')).toEqual({ start: 6, len: 4 })
  })
  it('falls back to a real word, and picks the same one every time', () => {
    const a = pickKeyword('偶然相遇的瞬间')
    expect(a).toEqual(pickKeyword('偶然相遇的瞬间'))
    expect(a.len).toBeGreaterThanOrEqual(2)
  })
  it('picks a whole latin word', () => {
    const t = 'hold the light'
    const k = pickKeyword(t)
    expect(['hold', 'the', 'light']).toContain([...t].slice(k.start, k.start + k.len).join(''))
  })
})

describe('timedUnits', () => {
  it('splits latin words whole and CJK per character', () => {
    expect(synthUnits('hi 世界')).toEqual(['hi ', '世', '界'])
  })
  it('spreads 70% of the gap to the next block across the units', () => {
    const units = timedUnits({ type: 'text', role: 'primary', text: '巡り合う', at: 10 }, 14)
    expect(units).toHaveLength(4)
    expect(units[0]!.time).toBe(10)
    const end = units.at(-1)!.time + units.at(-1)!.duration
    expect(end).toBeCloseTo(10 + 4 * 0.7)
  })
  it('uses verbatim timing when the block has it', () => {
    const units = timedUnits(
      { type: 'text', role: 'primary', text: '巡り合う', at: 2, timing: [{ at: 0, len: 2 }, { at: 1, len: 2 }] },
      5,
    )
    expect(units.map((u) => [u.text, u.time, u.duration])).toEqual([
      ['巡り', 2, 1],
      ['合う', 3, 2],
    ])
  })
})
