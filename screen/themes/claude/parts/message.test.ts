import { describe, expect, it } from 'vitest'
import type { Block } from '@contract'
import { measureOf } from './message'

const text = (t: string, role: Extract<Block, { type: 'text' }>['role'] = 'primary'): Block => ({ type: 'text', role, text: t })

describe('measure', () => {
  it('sets a few words large and a page of them at reading size', () => {
    expect(measureOf([text('Tests all green. Ship it?')])).toBe('brief')
    expect(measureOf([text('Anthropic、Claude Opus 5.5 を公開'), text('……このカードを書いてるのも、それ (´∀｀)ゞ', 'annotation')])).toBe('short')
    expect(measureOf([text('一'.repeat(60)), text('二'.repeat(40))])).toBe('long')
  })

  it('does not count the credit, and a lone figure is brief', () => {
    expect(measureOf([text('今日もおつかれ'), text('AI Weekly ・ 9/23 ・ a long source line', 'attribution')])).toBe('brief')
    expect(measureOf([{ type: 'value', role: 'primary', value: 42.3, unit: 'MB' }])).toBe('brief')
  })
})
