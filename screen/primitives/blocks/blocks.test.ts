import { describe, expect, it } from 'vitest'
import type { Presentation } from '@contract'
import { activeBlockIndex, fitText, toText } from './index'

const card: Presentation = {
  context: {},
  timeline: { kind: 'self' },
  blocks: [
    { type: 'text', role: 'primary', text: '巡り合う', at: 0 },
    { type: 'text', role: 'secondary', text: '偶然相遇；邂逅', short: '邂逅', at: 4 },
    { type: 'text', role: 'annotation', text: '旅先で旧友に巡り合う', at: 8 },
  ],
}

describe('block primitives', () => {
  it('finds the current block by local time', () => {
    expect(activeBlockIndex(card, 0)).toBe(0)
    expect(activeBlockIndex(card, 5)).toBe(1)
    expect(activeBlockIndex(card, 99)).toBe(2)
  })

  it('is before the first block when it has not started', () => {
    const late: Presentation = { ...card, blocks: [{ type: 'text', role: 'primary', text: 'x', at: 2 }] }
    expect(activeBlockIndex(late, 1)).toBe(-1)
  })

  it('shows the first block of untimed content', () => {
    expect(activeBlockIndex({ ...card, timeline: { kind: 'none' } }, undefined)).toBe(0)
  })

  it('reads a value as a line of text', () => {
    expect(toText({ type: 'value', role: 'primary', value: 3, unit: '个失败', label: 'CI' })).toBe('CI · 3 个失败')
  })

  it('falls back to the short form when the text does not fit', () => {
    expect(fitText(card.blocks[1]!, 4)).toBe('邂逅')
    expect(fitText(card.blocks[1]!, 20)).toBe('偶然相遇；邂逅')
  })
})
