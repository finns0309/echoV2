import { describe, expect, it } from 'vitest'
import type { Block } from '@contract'
import { wordOf } from './strokes'

const head = (text: string, reading?: string): Block[] => [{ type: 'text', role: 'primary', text, ...(reading ? { reading } : {}) }]

describe('a word to write', () => {
  it('is a short primary line in kana and kanji, with a reading', () => {
    expect(wordOf(head('巡り合う', 'めぐりあう'))).toBe('巡り合う')
    expect(wordOf(head('号外', 'ごうがい'))).toBe('号外')
  })

  it('is not a sentence, a line without a reading, or anything else', () => {
    expect(wordOf(head('暑さ寒さも彼岸まで', 'あつささむさもひがんまで'))).toBeNull()
    expect(wordOf(head('号外'))).toBeNull()
    expect(wordOf(head('AI 速報', 'えーあい'))).toBeNull()
  })
})
