import { afterEach, describe, expect, it } from 'vitest'
import type { Content, Presentation, ThemeManifest } from '@contract'
import { createMemoryStore } from '@server/foundation/store'
import { createContentStore } from './contents'
import { createStageService, type StageService } from './service'
import { createStage } from './state'

const manifest: ThemeManifest = {
  id: 'demo',
  label: 'demo',
  profile: 'ambient',
  slots: { main: { accepts: ['text'], timelines: ['self'], role: 'main' } },
}

const card = (text: string): Content => ({
  id: 'card:a',
  pack: 'card',
  kind: 'card',
  priority: 'normal',
  createdAt: 0,
  presentation: { context: {}, timeline: { kind: 'self' }, blocks: [{ type: 'text', role: 'primary', text }], hints: { dwell: 60 } },
})

const tick = () => new Promise((r) => setTimeout(r, 0))
let service: StageService | undefined
afterEach(() => service?.stop())

function setup(direct: (theme: string, p: Presentation) => Promise<unknown>) {
  const stage = createStage({ main: { profile: 'ambient', theme: 'demo', slots: {} } })
  const contents = createContentStore(createMemoryStore(), () => 0)
  service = createStageService({
    contents,
    stage,
    manifests: { demo: manifest },
    surfaces: () => [{ id: 'main', profile: 'ambient', theme: 'demo' }],
    emitSignal: () => {},
    direct,
    now: () => 0,
    tickMs: 60_000,
  })
  return { stage, ctx: service.packContext, run: service.run }
}

describe('stage service directions', () => {
  it('asks once for on-air content and folds the answer into OnAir.directions', async () => {
    const asks: string[] = []
    const { stage, ctx, run } = setup(async (theme, p) => {
      asks.push(`${theme}:${p.blocks.length}`)
      return { staged: true }
    })
    ctx.upsert(card('hello'))
    await tick()
    run()
    await tick()
    expect(stage.snapshot().surfaces.main!.slots.main?.directions).toEqual({ staged: true })
    expect(asks).toEqual(['demo:1'])
  })

  it('leaves directions empty when the answer is null', async () => {
    const { stage, ctx } = setup(async () => null)
    ctx.upsert(card('hello'))
    await tick()
    expect(stage.snapshot().surfaces.main!.slots.main).not.toHaveProperty('directions')
  })

  it('drops stale directions and asks again when the same content changes its text', async () => {
    let n = 0
    const { stage, ctx } = setup(async () => ({ n: ++n }))
    ctx.upsert(card('first'))
    await tick()
    expect(stage.snapshot().surfaces.main!.slots.main?.directions).toEqual({ n: 1 })
    ctx.upsert(card('second'))
    await tick()
    expect(stage.snapshot().surfaces.main!.slots.main?.directions).toEqual({ n: 2 })
  })

  it('asks ahead of time about content waiting in line, once', async () => {
    const asks: string[] = []
    const { stage, ctx, run } = setup(async (_theme, p) => {
      asks.push(p.blocks.map((b) => (b.type === 'text' ? b.text : '')).join())
      return null
    })
    ctx.upsert(card('on air'))
    ctx.upsert({ ...card('queued'), id: 'card:b', createdAt: 1 })
    await tick()
    run()
    run()
    await tick()
    expect(stage.snapshot().surfaces.main!.slots.main?.contentId).toBe('card:a')
    expect(asks.filter((a) => a === 'queued')).toHaveLength(1)
  })
})

describe('stage service rotation', () => {
  it('sends repeating content back in line, taking turns, behind anything new', () => {
    let t = 0
    const stage = createStage({ main: { profile: 'ambient', theme: 'demo', slots: {} } })
    const contents = createContentStore(createMemoryStore(), () => t)
    service = createStageService({
      contents,
      stage,
      manifests: { demo: manifest },
      surfaces: () => [{ id: 'main', profile: 'ambient', theme: 'demo' }],
      emitSignal: () => {},
      direct: async () => null,
      now: () => t,
      tickMs: 60_000,
    })
    const looped = (id: string, createdAt: number): Content => ({
      ...card(id),
      id,
      priority: 'ambient',
      repeat: true,
      group: 'murmur',
      createdAt,
      presentation: { ...card(id).presentation, hints: { dwell: 10 } },
    })
    const onAir = () => stage.snapshot().surfaces.main!.slots.main?.contentId ?? null
    const at = (ms: number) => {
      t = ms
      service!.run()
      service!.run() // the pass after consuming fills the freed slot
    }

    service.packContext.upsert(looped('a', 0))
    service.packContext.upsert(looped('b', 1))
    at(0)
    expect(onAir()).toBe('a')
    at(10_000) // a's run is over: it goes behind b
    expect(onAir()).toBe('b')
    expect(contents.get('a')?.createdAt).toBe(10_000)
    t = 12_000
    service.packContext.upsert({ ...card('news'), id: 'news', createdAt: 12_000 })
    expect(onAir()).toBe('news') // anything new cuts in at once
    at(72_000) // news is done; b was interrupted, not finished, so it is still b's turn
    expect(onAir()).toBe('b')
    at(82_000)
    expect(onAir()).toBe('a')
    expect(contents.list().map((c) => c.id).sort()).toEqual(['a', 'b'])
    expect(contents.removeGroup('murmur')).toBe(2)
  })
})

