import { describe, expect, it } from 'vitest'
import type { Presentation } from '@contract'
import { summarize } from './card'

const p = (context: Presentation['context'], blocks: Presentation['blocks']): Presentation => ({ context, timeline: { kind: 'self' }, blocks })

describe('a card as a phone reads it', () => {
  it('comes from the speaker when there is one, with the title under it', () => {
    const s = summarize(p({ title: '開発', speaker: { name: 'Claude' }, palette: ['#D97757'] }, [{ type: 'text', role: 'primary', text: 'テスト通過' }]))
    expect(s).toEqual({ app: 'Claude', mark: 'C', color: '#D97757', title: '開発', body: ['テスト通過'] })
  })

  it('otherwise from its title, reading every block as text but the credit', () => {
    const s = summarize(
      p({ title: '2026年' }, [
        { type: 'progress', role: 'primary', value: 3, max: 4, label: '今年' },
        { type: 'text', role: 'annotation', text: '水曜日' },
        { type: 'text', role: 'attribution', text: 'AI Weekly' },
      ]),
    )
    expect(s.app).toBe('2026年')
    expect(s.mark).toBe('2')
    expect(s.body).toEqual(['今年 · 75%', '水曜日'])
  })
})
