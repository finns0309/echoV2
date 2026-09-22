import { describe, expect, it } from 'vitest'
import { Content } from '@contract'
import { toContent } from './model'

const id = () => 'fixed'

describe('card pack', () => {
  it('turns lines into a staggered self-timed presentation', () => {
    const r = toContent(
      {
        kind: 'word',
        speaker: 'Claude',
        lines: [{ text: '巡り合う', reading: 'めぐりあう' }, { text: '偶然相遇；邂逅', short: '邂逅' }, '旅先で旧友に巡り合う'],
      },
      1000,
      id,
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(Content.safeParse(r.content).success).toBe(true)
    expect(r.content.id).toBe('card:fixed')
    const p = r.content.presentation
    expect(p.timeline).toEqual({ kind: 'self' })
    expect(p.blocks.map((b) => [b.role, b.type === 'text' && b.at])).toEqual([
      ['primary', 0],
      ['secondary', 4],
      ['annotation', 8],
    ])
    expect(p.hints?.dwell).toBe(14)
    expect(p.context.speaker).toEqual({ name: 'Claude' })
  })

  it('turns a value into a status with no timeline', () => {
    const r = toContent({ title: 'CI', value: { value: 3, unit: '个失败' } }, 0, id)
    expect(r.ok && r.content.kind).toBe('status')
    expect(r.ok && r.content.presentation.timeline).toEqual({ kind: 'none' })
  })

  it('sets expiry from ttl and keeps the agent id stable for updates', () => {
    const r = toContent({ id: 'ci-main', lines: ['x'], ttlSeconds: 60 }, 1000, id)
    expect(r.ok && r.content.id).toBe('card:ci-main')
    expect(r.ok && r.content.expiresAt).toBe(61_000)
  })

  it('drops an emphasis that is not in the text instead of failing', () => {
    const r = toContent({ lines: [{ text: 'hello', emphasis: 'world' }] }, 0, id)
    expect(r.ok && r.content.presentation.blocks[0]).not.toHaveProperty('emphasis')
  })

  it('rejects input with nothing to show, with a readable reason', () => {
    const r = toContent({ title: 'empty' }, 0, id)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toMatch(/lines, value or presentation/)
  })
})
