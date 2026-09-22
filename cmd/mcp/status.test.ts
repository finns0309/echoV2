import { describe, expect, it } from 'vitest'
import type { StageState } from '@contract'
import { summarizeStatus } from './status'

const lines = (n: number) => Array.from({ length: n }, (_, i) => ({ type: 'text' as const, role: 'primary' as const, text: `line ${i}`, at: i }))

const stage: StageState = {
  rev: 1,
  surfaces: {
    main: {
      profile: 'hanging',
      theme: 'furin',
      slots: {
        main: {
          contentId: 'music:now',
          presentation: {
            context: { title: 'Earth' },
            timeline: { kind: 'media', position: 0, sampledAt: 0, rate: 1, version: 1 },
            blocks: lines(300),
          },
          since: 1_000,
        },
        side: {
          contentId: 'card:w',
          presentation: { context: {}, timeline: { kind: 'self' }, blocks: [{ type: 'text', role: 'primary', text: '木漏れ日' }] },
          since: 5_000,
        },
        ambient: null,
      },
    },
  },
}

const contents = [
  { id: 'music:now', kind: 'song', priority: 'normal', title: 'Earth' },
  { id: 'card:w', kind: 'word', priority: 'normal' },
  { id: 'card:next', kind: 'fact', priority: 'normal' },
]

describe('summarizeStatus', () => {
  it('lists what is on air without its blocks', () => {
    const { onAir } = summarizeStatus(stage, contents, 11_000)
    expect(onAir).toEqual([
      { surface: 'main', slot: 'main', theme: 'furin', id: 'music:now', kind: 'song', priority: 'normal', headline: 'Earth', onAirSeconds: 10 },
      { surface: 'main', slot: 'side', theme: 'furin', id: 'card:w', kind: 'word', priority: 'normal', headline: '木漏れ日', onAirSeconds: 6 },
    ])
    expect(JSON.stringify(onAir)).not.toContain('line 1')
  })

  it('queues only what is not on air', () => {
    expect(summarizeStatus(stage, contents, 11_000).queued.map((c) => c.id)).toEqual(['card:next'])
  })

  it('truncates long headlines', () => {
    const long: StageState = structuredClone(stage)
    long.surfaces.main!.slots.main!.presentation.context.title = 'x'.repeat(200)
    expect(summarizeStatus(long, contents, 11_000).onAir[0]!.headline).toHaveLength(60)
  })
})
