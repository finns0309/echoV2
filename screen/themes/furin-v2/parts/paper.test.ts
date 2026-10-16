import { describe, expect, it } from 'vitest'
import { paperOf, sizeFor } from './paper'

describe('the card', () => {
  it('sets a short line large and a longer one smaller, in one column', () => {
    expect(sizeFor(4)).toBe(17)
    expect(sizeFor(9)).toBe(15)
    expect(sizeFor(11)).toBe(12)
    // A column of nine at 15 px fits the card's writing space.
    expect(9 * 15 * 1.14).toBeLessThanOrEqual(158)
  })

  it('goes to two columns past that', () => {
    expect(sizeFor(16)).toBe(13)
    expect(sizeFor(22)).toBe(13)
  })

  it('carries a line, its reading, or its short form when it is too long', () => {
    expect(paperOf({ type: 'text', role: 'primary', text: '巡り合う', reading: 'めぐりあう' }, 22)).toEqual({ kind: 'text', text: '巡り合う', reading: 'めぐりあう', lang: 'ja' })
    const long = '一'.repeat(30)
    expect(paperOf({ type: 'text', role: 'primary', text: long, short: '一二三', reading: 'x' }, 22)).toEqual({ kind: 'text', text: '一二三', lang: 'zh' })
  })
})
