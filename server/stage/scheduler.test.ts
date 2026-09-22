import { describe, expect, it } from 'vitest'
import type { Content, Presentation, Priority, Surface, ThemeManifest } from '@contract'
import { dwellSeconds, schedule, type SurfaceConfig } from './scheduler'

const manifest = (id: string, extra: Partial<ThemeManifest['slots'][string]> = {}): ThemeManifest => ({
  id,
  label: id,
  window: 'hanging',
  slots: { main: { accepts: ['text'], timelines: ['self', 'media', 'none', 'wall'], role: 'main', ...extra } },
})

const card = (id: string, priority: Priority = 'normal', createdAt = 0, p: Partial<Presentation> = {}): Content => ({
  id,
  pack: 'card',
  kind: 'word',
  priority,
  createdAt,
  presentation: {
    context: {},
    timeline: { kind: 'self' },
    blocks: [{ type: 'text', role: 'primary', text: id }],
    hints: { dwell: 10 },
    ...p,
  },
})

const surfaces: SurfaceConfig[] = [{ id: 'main', profile: 'hanging', theme: 'demo' }]
const manifests = { demo: manifest('demo') }

function run(contents: Content[], current: Record<string, Surface> = {}, now = 1000) {
  return schedule({ surfaces, manifests, contents, current, now })
}
const onAir = (out: ReturnType<typeof run>) => out.surfaces.main!.slots.main?.contentId ?? null

describe('scheduler', () => {
  it('leaves the slot empty with nothing to show', () => {
    expect(onAir(run([]))).toBeNull()
  })

  it('shows the highest priority first, then the oldest', () => {
    expect(onAir(run([card('a', 'normal', 2), card('b', 'normal', 1)]))).toBe('b')
    expect(onAir(run([card('a', 'normal', 1), card('b', 'urgent', 2)]))).toBe('b')
  })

  it('keeps a card up until its dwell ends, then consumes it and shows the next', () => {
    const first = run([card('a'), card('b', 'normal', 1)], {}, 0)
    expect(onAir(first)).toBe('a')
    const during = run([card('a'), card('b', 'normal', 1)], first.surfaces, 9_000)
    expect(onAir(during)).toBe('a')
    const after = run([card('a'), card('b', 'normal', 1)], first.surfaces, 10_000)
    expect(after.finished).toEqual(['a'])
    expect(onAir(after)).toBe('b')
  })

  it('keeps the clock running when a card on air grows or its value changes', () => {
    const first = run([card('a')], {}, 0)
    const grown = card('a', 'normal', 0, {
      blocks: [
        { type: 'text', role: 'primary', text: 'a' },
        { type: 'text', role: 'secondary', text: 'more', at: 4 },
      ],
    })
    const next = run([grown], first.surfaces, 5_000)
    expect(next.surfaces.main!.slots.main?.since).toBe(0)
    expect(next.surfaces.main!.slots.main?.presentation.blocks[1]).toMatchObject({ text: 'more' })

    const value = (v: number) => card('v', 'normal', 0, { timeline: { kind: 'none' }, blocks: [{ type: 'value', role: 'primary', value: v }] })
    const shown = run([value(1)], {}, 0)
    expect(run([value(2)], shown.surfaces, 5_000).surfaces.main!.slots.main?.since).toBe(0)
  })

  it('starts a card on air over when its text is rewritten', () => {
    const first = run([card('a')], {}, 0)
    const rewritten = card('a', 'normal', 0, { blocks: [{ type: 'text', role: 'primary', text: 'new text' }] })
    const next = run([rewritten], first.surfaces, 5_000)
    expect(next.surfaces.main!.slots.main?.since).toBe(5_000)
    expect(next.surfaces.main!.slots.main?.presentation.blocks[0]).toMatchObject({ text: 'new text' })
  })

  it('lets urgent interrupt, and puts the interrupted card back in line', () => {
    const first = run([card('a')], {}, 0)
    const interrupted = run([card('a'), card('u', 'urgent', 1)], first.surfaces, 2_000)
    expect(onAir(interrupted)).toBe('u')
    expect(interrupted.finished).toEqual([])
  })

  it('does not let normal interrupt normal', () => {
    const first = run([card('a')], {}, 0)
    expect(onAir(run([card('a'), card('b', 'normal', 1)], first.surfaces, 2_000))).toBe('a')
  })

  it('shows ambient content only when nothing more important is around', () => {
    expect(onAir(run([card('amb', 'ambient')]))).toBe('amb')
    expect(onAir(run([card('amb', 'ambient'), card('n', 'normal', 5)]))).toBe('n')
    const idle = run([card('amb', 'ambient')], {}, 0)
    expect(onAir(run([card('amb', 'ambient'), card('n', 'normal', 5)], idle.surfaces, 1_000))).toBe('n')
  })

  it('lets normal content cut into media only inside a declared break', () => {
    const song: Content = {
      ...card('song'),
      kind: 'song',
      presentation: {
        context: {},
        timeline: { kind: 'media', position: 0, sampledAt: 0, rate: 1, version: 1 },
        blocks: [{ type: 'text', role: 'primary', text: 'line', at: 20 }],
        hints: { breaks: [{ at: 0, until: 15 }] },
      },
    }
    const first = run([song], {}, 0)
    expect(onAir(run([song, card('w', 'normal', 1)], first.surfaces, 5_000))).toBe('w') // 5s: in the intro
    expect(onAir(run([song, card('w', 'normal', 1)], first.surfaces, 30_000))).toBe('song') // 30s: vocals
  })

  it('respects slot restrictions on timeline and kind', () => {
    const songOnly = { demo: manifest('demo', { kinds: ['song'] }) }
    expect(onAir(schedule({ surfaces, manifests: songOnly, contents: [card('a')], current: {}, now: 0 }))).toBeNull()
    const selfOnly = { demo: manifest('demo', { timelines: ['self'] }) }
    const status: Content = { ...card('s'), presentation: { ...card('s').presentation, timeline: { kind: 'none' } } }
    expect(onAir(schedule({ surfaces, manifests: selfOnly, contents: [status], current: {}, now: 0 }))).toBeNull()
  })

  it('fills surfaces in order and never shows one content twice', () => {
    const two: SurfaceConfig[] = [...surfaces, { id: 'corner', profile: 'hanging', theme: 'demo' }]
    const out = schedule({ surfaces: two, manifests, contents: [card('a'), card('b', 'normal', 1)], current: {}, now: 0 })
    expect(out.surfaces.main!.slots.main?.contentId).toBe('a')
    expect(out.surfaces.corner!.slots.main?.contentId).toBe('b')
  })

  it('derives a dwell from the last block when none is given', () => {
    const p: Presentation = {
      context: {},
      timeline: { kind: 'self' },
      blocks: [
        { type: 'text', role: 'primary', text: 'a', at: 0 },
        { type: 'text', role: 'secondary', text: 'b', at: 8 },
      ],
    }
    expect(dwellSeconds(p)).toBe(14)
  })

  describe('several surfaces', () => {
    // An ambient song and an agent card, the shapes the music and card packs send.
    const song: Content = { ...card('song', 'ambient'), pack: 'music', kind: 'song' }
    const note = card('note', 'normal', 1)
    const on = (out: ReturnType<typeof schedule>, surface: string) => out.surfaces[surface]!.slots.main?.contentId ?? null
    const two = (a: Partial<SurfaceConfig> = {}, b: Partial<SurfaceConfig> = {}): SurfaceConfig[] => [
      { id: 'main', profile: 'hanging', theme: 'demo', ...a },
      { id: 'agent', profile: 'hanging', theme: 'demo', ...b },
    ]
    const step = (s: SurfaceConfig[], contents: Content[], current: Record<string, Surface> = {}, now = 1000) =>
      schedule({ surfaces: s, manifests, contents, current, now })
    const split = two({ accepts: { packs: ['music'] }, fallback: true }, { accepts: { packs: ['card'] } })

    it('uses a free slot before pushing anything aside', () => {
      const playing = step(two(), [song], {}, 0)
      expect(on(playing, 'main')).toBe('song')
      const out = step(two(), [song, note], playing.surfaces)
      expect(on(out, 'main')).toBe('song')
      expect(on(out, 'agent')).toBe('note')
    })

    it('keeps ambient content up on one surface while another shows something important', () => {
      const out = step(two(), [note, song])
      expect(on(out, 'main')).toBe('note')
      expect(on(out, 'agent')).toBe('song')
    })

    it('routes each content only to surfaces that take it', () => {
      const busy = step(split, [song, note, card('next', 'normal', 2)], {}, 0)
      expect(on(busy, 'main')).toBe('song')
      expect(on(busy, 'agent')).toBe('note')
      // the next card waits for the agent surface instead of taking the song's
      expect(on(step(split, [song, note, card('next', 'normal', 2)], busy.surfaces), 'main')).toBe('song')
      // even urgent content stays on its own surface
      expect(on(step(split, [song, note, card('u', 'urgent', 3)], busy.surfaces), 'main')).toBe('song')
    })

    it('sends what a hidden surface would take to the fallback, and back when it returns', () => {
      const playing = step(split, [song], {}, 0)
      const hidden = two({ accepts: { packs: ['music'] }, fallback: true }, { accepts: { packs: ['card'] }, hidden: true })
      const away = step(hidden, [song, note], playing.surfaces)
      expect(on(away, 'main')).toBe('note') // as with one window: normal takes ambient's place
      expect(on(away, 'agent')).toBeNull()
      expect(away.surfaces.agent!.hidden).toBe(true)
      const back = step(split, [song, note], away.surfaces, 2000)
      expect(on(back, 'agent')).toBe('note')
      expect(on(back, 'main')).toBe('song')
    })

    it('leaves content no visible surface takes, and with no fallback, waiting', () => {
      const out = step(two({ accepts: { packs: ['music'] } }, { accepts: { packs: ['card'] }, hidden: true }), [note])
      expect(on(out, 'main')).toBeNull()
    })

    it('matches routes on kind as well as pack', () => {
      const words = two({ accepts: { kinds: ['song'] } }, { accepts: { packs: ['card'], kinds: ['word'] } })
      const fact: Content = { ...card('fact'), kind: 'fact' }
      const out = step(words, [note, fact])
      expect(on(out, 'agent')).toBe('note')
      expect(on(out, 'main')).toBeNull()
    })
  })

  describe('named windows and ensembles', () => {
    const on = (out: ReturnType<typeof schedule>, surface: string) => out.surfaces[surface]!.slots.main ?? null
    const lr = (left: Partial<SurfaceConfig> = {}, right: Partial<SurfaceConfig> = {}): SurfaceConfig[] => [
      { id: 'l', name: 'left', profile: 'hanging', theme: 'demo', ...left },
      { id: 'r', name: 'right', profile: 'hanging', theme: 'demo', ...right },
    ]
    const step = (s: SurfaceConfig[], contents: Content[], current: Record<string, Surface> = {}, now = 1000) =>
      schedule({ surfaces: s, manifests, contents, current, now })
    const to = (c: Content, window: string, together?: string): Content => ({ ...c, window, ...(together ? { together } : {}) })

    it('puts content in the window it prefers, even with another one free', () => {
      const out = step(lr(), [to(card('a'), 'right')])
      expect(on(out, 'r')?.contentId).toBe('a')
      expect(on(out, 'l')).toBeNull()
      expect(out.surfaces.r!.name).toBe('right')
    })

    it('waits for its window rather than taking another', () => {
      const busy = step(lr(), [to(card('first'), 'right')], {}, 0)
      const out = step(lr(), [to(card('first'), 'right'), to(card('next', 'normal', 1), 'right')], busy.surfaces)
      expect(on(out, 'r')?.contentId).toBe('first')
      expect(on(out, 'l')).toBeNull()
    })

    it("ignores the preference when that window is hidden, missing, or its route doesn't take it", () => {
      expect(on(step(lr({}, { hidden: true }), [to(card('a'), 'right')]), 'l')?.contentId).toBe('a')
      expect(on(step(lr(), [to(card('a'), 'nowhere')]), 'l')?.contentId).toBe('a')
      const lyricsOnly = lr({}, { accepts: { packs: ['music'] } })
      expect(on(step(lyricsOnly, [to(card('a'), 'right')]), 'l')?.contentId).toBe('a')
    })

    it('puts an ensemble on air together, with one start', () => {
      const out = step(lr(), [to(card('says'), 'left', 'duo'), to(card('answers', 'normal', 1), 'right', 'duo')], {}, 5000)
      expect(on(out, 'l')).toMatchObject({ contentId: 'says', since: 5000 })
      expect(on(out, 'r')).toMatchObject({ contentId: 'answers', since: 5000 })
    })

    it('holds an ensemble until all of it fits, keeping the free window from later content', () => {
      const busy = step(lr(), [to(card('long'), 'right')], {}, 0)
      const duo = [to(card('says', 'normal', 1), 'left', 'duo'), to(card('answers', 'normal', 2), 'right', 'duo')]
      const waiting = step(lr(), [to(card('long'), 'right'), ...duo, card('later', 'normal', 3)], busy.surfaces, 1000)
      expect(on(waiting, 'l')).toBeNull() // kept for the duo, not given to "later"
      const free = step(lr(), [...duo, card('later', 'normal', 3)], waiting.surfaces, 11_000) // "long" is done
      expect(on(free, 'l')?.contentId).toBe('says')
      expect(on(free, 'r')?.contentId).toBe('answers')
    })

    it('does not hold windows for an ensemble that cannot fit at all', () => {
      const duo = [to(card('says'), 'left', 'duo'), to(card('answers'), 'right', 'duo')]
      const out = step(lr({}, { hidden: true }), [...duo, card('later', 'normal', 3)])
      expect(on(out, 'l')?.contentId).toBe('later')
    })

    it('lets a normal ensemble push ambient content aside, but an ambient one only takes quiet windows', () => {
      const idle = step(lr(), [card('amb', 'ambient')], {}, 0)
      const duo = [to(card('says', 'normal', 1), 'left', 'duo'), to(card('answers', 'normal', 2), 'right', 'duo')]
      const out = step(lr(), [card('amb', 'ambient'), ...duo], idle.surfaces)
      expect([on(out, 'l')?.contentId, on(out, 'r')?.contentId]).toEqual(['says', 'answers'])

      const busy = step(lr(), [card('n')], {}, 0)
      const quietDuo = [to(card('x', 'ambient', 1), 'left', 'q'), to(card('y', 'ambient', 2), 'right', 'q')]
      const held = step(lr(), [card('n'), ...quietDuo], busy.surfaces)
      expect(on(held, 'l')?.contentId).toBe('n')
      expect(on(held, 'r')).toBeNull()
    })

    it('does not restart part of an ensemble while the rest is still on air', () => {
      const short = { ...to(card('says'), 'left', 'duo'), presentation: { ...card('says').presentation, hints: { dwell: 2 } } }
      const first = step(lr(), [short, to(card('answers'), 'right', 'duo')], {}, 0)
      const later = step(lr(), [short, to(card('answers'), 'right', 'duo')], first.surfaces, 3000)
      expect(later.finished).toEqual(['says'])
      // "says" is back in line (as a repeat would be) while "answers" plays on: it waits
      const again = step(lr(), [short, to(card('answers'), 'right', 'duo')], later.surfaces, 3500)
      expect(on(again, 'l')).toBeNull()
      expect(on(again, 'r')?.contentId).toBe('answers')
    })
  })
})

