import { describe, expect, it } from 'vitest'
import type { Presentation } from '@contract'
import { directionsOf, grammar } from './grammar'

const p: Presentation = {
  context: { title: '日语 · 第 3 天' },
  timeline: { kind: 'self' },
  blocks: [
    { type: 'text', role: 'primary', text: '巡り合う', at: 0 },
    { type: 'text', role: 'secondary', text: '偶然相遇 在旅途中', at: 4 },
    { type: 'value', role: 'annotation', value: 3 },
    { type: 'text', role: 'annotation', text: '巡り合う', at: 8 },
  ],
}

describe('eva grammar', () => {
  it('numbers only the text blocks, with their times', () => {
    const prep = grammar.prepare(p)!
    expect(prep.input).toBe('《日语 · 第 3 天》\n0 00:00 巡り合う\n1 00:04 偶然相遇 在旅途中\n2 00:08 巡り合う')
    expect(prep.key).toBe('巡り合う\n偶然相遇 在旅途中\n巡り合う')
  })

  it('parses template, white card, breaks and emphasis back onto block positions', () => {
    const out = directionsOf(grammar.parse('0 bleed inv\n1 corner /在旅途中 .偶然相遇\n2 stack', p))!
    expect(out.cards[0]).toEqual({ tpl: 'bleed', inv: true })
    expect(out.cards[1]).toEqual({ tpl: 'corner', brk: ['在旅途中'], kw: '偶然相遇' })
    expect(out.cards[2]).toBeNull() // the value block is not directed
    // identical text, identical direction: line 2's own "stack" loses to line 0's
    expect(out.cards[3]).toEqual({ tpl: 'bleed', inv: true })
  })

  it('drops breaks and emphasis that are not in the text', () => {
    const out = directionsOf(grammar.parse('1 dual /不存在 .也不存在', p))!
    expect(out.cards[1]).toEqual({ tpl: 'dual' })
  })

  it('caps white cards at three', () => {
    const many: Presentation = {
      ...p,
      blocks: ['一', '二', '三', '四', '五'].map((t, i) => ({ type: 'text', role: 'primary', text: t, at: i })),
    }
    const out = directionsOf(grammar.parse('0 bleed inv\n1 bleed inv\n2 bleed inv\n3 bleed inv\n4 bleed inv', many))!
    expect(out.cards.filter((c) => c?.inv)).toHaveLength(3)
  })

  it('returns null for unusable output', () => {
    expect(grammar.parse('I cannot help with that.', p)).toBeNull()
    expect(directionsOf({ nope: true })).toBeNull()
  })
})
