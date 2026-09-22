import { describe, expect, it } from 'vitest'
import { Content } from '@contract'
import type { PackContext } from '@server/stage/pack-api'
import { computeBreaks } from './breaks'
import { MUSIC_CONTENT_ID, toContent, type NowPlaying } from './model'
import { createMusicPack } from './pack'
import { createOnsetDetector } from './signals'

const now = (over: Partial<NowPlaying> = {}): NowPlaying => ({
  songId: 1,
  title: '夜',
  artist: 'someone',
  cover: 'https://cover',
  duration: 200,
  position: 10,
  sampledAt: 1000,
  playing: true,
  version: 1,
  ...over,
})

describe('breaks', () => {
  it('finds the intro, a long interlude and the outro', () => {
    const lines = [
      { time: 20, text: 'a' },
      { time: 24, text: 'b' },
      { time: 60, text: 'c', duration: 4 },
    ]
    expect(computeBreaks(lines, 100)).toEqual([
      { at: 0, until: 18.5 },
      { at: 31, until: 58.5 },
      { at: 65, until: 100 },
    ])
  })
  it('makes an instrumental one long break', () => {
    expect(computeBreaks([], 180)).toEqual([{ at: 0, until: 180 }])
  })
})

describe('toContent', () => {
  it('is a valid media-timed song with verbatim timing on its blocks', () => {
    const c = toContent(
      now(),
      [{ time: 12, duration: 2, text: '巡り合う', units: [{ time: 12, duration: 1, text: '巡り' }, { time: 13, duration: 1, text: '合う' }] }],
      null,
      5,
    )
    expect(Content.safeParse(c).success).toBe(true)
    expect(c.id).toBe(MUSIC_CONTENT_ID)
    expect(c.presentation.timeline).toEqual({ kind: 'media', position: 10, sampledAt: 1000, rate: 1, version: 1 })
    expect(c.presentation.blocks[0]).toMatchObject({ text: '巡り合う', at: 12, timing: [{ at: 0, len: 2 }, { at: 1, len: 2 }] })
  })
  it('steps aside while paused, and shows the title when there are no lyrics', () => {
    const c = toContent(now({ playing: false }), [], null, 0)
    expect(c.priority).toBe('ambient')
    expect(c.presentation.timeline).toMatchObject({ rate: 0 })
    expect(c.presentation.blocks).toEqual([{ type: 'text', role: 'primary', text: '夜', at: 0 }])
  })
})

describe('onset detector', () => {
  it('passes loudness through and fires on a sudden rise', () => {
    const detect = createOnsetDetector()
    const quiet = Array(24).fill(0.1)
    const loud = Array(24).fill(0.6)
    expect(detect({ t: 0, bands: quiet, rms: 0.1, version: 1 })).toMatchObject({ energy: 0.1 })
    expect(detect({ t: 33, bands: loud, rms: 0.5, version: 1 }).onset).toBeGreaterThan(0.6)
    expect(detect({ t: 66, bands: loud, rms: 0.5, version: 1 }).onset).toBeUndefined()
  })
  it('does not compare across a discontinuity', () => {
    const detect = createOnsetDetector()
    detect({ t: 0, bands: Array(24).fill(0), rms: 0, version: 1 })
    expect(detect({ t: 33, bands: Array(24).fill(1), rms: 1, version: 2 }).onset).toBeUndefined()
  })
})

describe('music pack', () => {
  function harness(sequence: (NowPlaying | null)[]) {
    const upserts: Content[] = []
    const removals: string[] = []
    const lyricCalls: number[] = []
    let i = 0
    const ctx: PackContext = { upsert: (c) => upserts.push(c), remove: (id) => (removals.push(id), true), emitSignal: () => {} }
    const pack = createMusicPack({
      sources: { now: async () => sequence[Math.min(i, sequence.length - 1)] ?? null, spectrum: () => () => {} },
      lyrics: {
        forTrack: async (t) => {
          lyricCalls.push(t.songId)
          return { lines: [{ time: 1, text: 'line' }], cover: null }
        },
      },
      pollMs: 60_000,
      goneAfter: 2,
    })
    // start() polls once on its own (sequence[0]); wait for it, then step through the rest.
    const start = async () => {
      pack.start(ctx)
      await new Promise((r) => setTimeout(r, 0))
      i = 1
    }
    const step = async () => {
      await pack.poll()
      i++
    }
    return { pack, start, step, upserts, removals, lyricCalls }
  }

  it('publishes a new track once, and again only on a discontinuity', async () => {
    const h = harness([now(), now({ position: 11 }), now({ version: 2, playing: false }), now({ songId: 2, version: 3 })])
    await h.start() // first track published
    await h.step() // clock moved, no discontinuity
    await h.step() // paused: version bumped
    await h.step() // new track
    h.pack.stop()
    expect(h.upserts.map((c) => [c.presentation.ext?.['music.songId'], c.priority])).toEqual([
      [1, 'normal'],
      [1, 'ambient'],
      [2, 'normal'],
    ])
    expect(h.lyricCalls).toEqual([1, 2])
  })

  it('takes the song off after muse has been gone a while', async () => {
    const h = harness([now(), null, null])
    await h.start()
    await h.step()
    await h.step()
    h.pack.stop()
    expect(h.removals).toEqual([MUSIC_CONTENT_ID, MUSIC_CONTENT_ID]) // stale cleanup at start, then gone
  })
})
