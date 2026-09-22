import { describe, expect, it } from 'vitest'
import type { OnAir, Timeline } from '@contract'
import { localTime } from './clock'

const onAir = (timeline: Timeline, since = 1_000): OnAir => ({
  contentId: 'x',
  since,
  presentation: { context: {}, timeline, blocks: [{ type: 'text', role: 'primary', text: 'x' }] },
})

describe('localTime', () => {
  it('counts self content from the moment it went on air', () => {
    expect(localTime(onAir({ kind: 'self' }, 1_000), 4_000)).toBe(3)
  })
  it('extrapolates media from its last sample', () => {
    const t = localTime(onAir({ kind: 'media', position: 10, sampledAt: 2_000, rate: 1, version: 1 }), 3_500)
    expect(t).toBe(11.5)
  })
  it('holds media still while paused', () => {
    expect(localTime(onAir({ kind: 'media', position: 10, sampledAt: 2_000, rate: 0, version: 1 }), 9_000)).toBe(10)
  })
  it('has no time for untimed content', () => {
    expect(localTime(onAir({ kind: 'none' }), 5_000)).toBeUndefined()
  })
})
