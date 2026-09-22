import { describe, expect, it } from 'vitest'
import type { Content, Surface } from '@contract'
import { createMemoryStore } from '@server/foundation/store'
import { createContentStore } from '@server/stage/contents'
import { createStage } from '@server/stage/state'
import { createAgentHandlers, preferenceNote } from './agent-handlers'

const card = (id: string, extra: Partial<Content> = {}): Content => ({
  id,
  pack: 'card',
  kind: 'word',
  priority: 'normal',
  createdAt: 0,
  presentation: { context: {}, timeline: { kind: 'self' }, blocks: [{ type: 'text', role: 'primary', text: id }] },
  ...extra,
})
const window = (name: string, extra: Partial<Surface> = {}): Surface => ({ name, profile: 'hanging', theme: 'furin', slots: {}, ...extra })

describe('agent handlers', () => {
  it('explains why a preferred window was not used', () => {
    const windows = [window('main', { accepts: { packs: ['music'] } }), window('top', { hidden: true })]
    expect(preferenceNote(card('a'), windows)).toBeNull()
    expect(preferenceNote(card('a', { window: 'left' }), windows)).toMatch(/no window named left \(windows: main, top\)/)
    expect(preferenceNote(card('a', { window: 'top' }), windows)).toMatch(/top is hidden/)
    expect(preferenceNote(card('a', { window: 'main' }), windows)).toMatch(/doesn't take this kind of card/)
  })

  it('reports where a submitted card went, whether it replaced one, and what it waits for', () => {
    const contents = createContentStore(createMemoryStore(), () => 0)
    const stage = createStage({ w2: window('top') })
    const handlers = createAgentHandlers({
      accept: (raw) => {
        const content = raw as Content
        contents.upsert(content)
        return { ok: true, content }
      },
      withdraw: () => false,
      contents,
      stage,
    })

    const duo = { id: 'duo', of: 2 }
    expect(handlers.submit(card('a', { together: duo }))).toEqual({
      ok: true,
      id: 'a',
      updated: false,
      state: 'queued',
      note: 'waiting for 1 more of ensemble duo before any of it shows',
    })
    stage.update({ w2: window('top', { slots: { main: { contentId: 'a', presentation: card('a').presentation, since: 0 } } }) })
    expect(handlers.submit(card('a'))).toEqual({ ok: true, id: 'a', updated: true, state: 'on-air', window: 'top' })
  })

  it('passes a rejection through untouched', () => {
    const handlers = createAgentHandlers({
      accept: () => ({ ok: false, error: 'lines: too many' }),
      withdraw: () => false,
      contents: createContentStore(createMemoryStore(), () => 0),
      stage: createStage({}),
    })
    expect(handlers.submit({})).toEqual({ ok: false, error: 'lines: too many' })
  })
})
