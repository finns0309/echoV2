import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Grammar, Presentation } from '@contract'
import { createDirector, type LlmClient } from './service'

const lines = (n: number): Presentation => ({
  context: {},
  timeline: { kind: 'self' },
  blocks: Array.from({ length: n }, (_, i) => ({ type: 'text' as const, role: 'primary' as const, text: `line ${i}` })),
})

const grammar: Grammar = {
  version: 1,
  instructions: 'stage it',
  prepare: (p) => ({ input: p.blocks.map((b) => (b.type === 'text' ? b.text : '')).join('\n'), key: String(p.blocks.length) }),
  parse: (out) => (out.startsWith('ok') ? { out } : null),
}

function fakeLlm(answer: string) {
  const calls: string[] = []
  const llm: LlmClient = {
    complete: async ({ input }) => {
      calls.push(input)
      return answer
    },
  }
  return { llm, calls }
}

const dir = () => mkdtempSync(join(tmpdir(), 'echo-director-'))

describe('director service', () => {
  it('asks the theme grammar and returns its parse', async () => {
    const { llm } = fakeLlm('ok!')
    const d = createDirector({ cacheDir: dir(), llm })
    d.register('eva', grammar)
    expect(await d.direct('eva', lines(4))).toEqual({ out: 'ok!' })
  })

  it('returns null for themes without a grammar, and for short content', async () => {
    const { llm, calls } = fakeLlm('ok')
    const d = createDirector({ cacheDir: dir(), llm })
    d.register('eva', grammar)
    expect(await d.direct('furin', lines(4))).toBeNull()
    expect(await d.direct('eva', lines(3))).toBeNull()
    expect(calls).toEqual([])
  })

  it('caches on disk by content, so a new process does not ask again', async () => {
    const cacheDir = dir()
    const first = fakeLlm('ok')
    const a = createDirector({ cacheDir, llm: first.llm })
    a.register('eva', grammar)
    await a.direct('eva', lines(4))
    expect(readdirSync(join(cacheDir, 'eva.v1'))).toHaveLength(1)

    const second = fakeLlm('ok')
    const b = createDirector({ cacheDir, llm: second.llm })
    b.register('eva', grammar)
    expect(await b.direct('eva', lines(4))).toEqual({ out: 'ok' })
    expect(second.calls).toEqual([])
  })

  it('shares one call between concurrent asks for the same content', async () => {
    const { llm, calls } = fakeLlm('ok')
    const d = createDirector({ cacheDir: dir(), llm })
    d.register('eva', grammar)
    await Promise.all([d.direct('eva', lines(5)), d.direct('eva', lines(5))])
    expect(calls).toHaveLength(1)
  })

  it('does not cache failures, so the next ask retries', async () => {
    const bad = fakeLlm('nope')
    const cacheDir = dir()
    const d = createDirector({ cacheDir, llm: bad.llm })
    d.register('eva', grammar)
    expect(await d.direct('eva', lines(4))).toBeNull()
    expect(await d.direct('eva', lines(4))).toBeNull()
    expect(bad.calls).toHaveLength(2)
  })

  it('stays silent without an LLM', async () => {
    const d = createDirector({ cacheDir: dir(), llm: null })
    d.register('eva', grammar)
    expect(await d.direct('eva', lines(4))).toBeNull()
  })

  describe('an earlier director', () => {
    // An old cache: one file per song, {text: fields}, plus a folder of {text: "word"}.
    function oldCache(texts: string[]) {
      const root = dir()
      mkdirSync(join(root, 'eva.v1'))
      mkdirSync(join(root, 'keyword.v1'))
      writeFileSync(join(root, 'eva.v1', 'other.json'), JSON.stringify({ 'some other song': { tpl: 'stack' } }))
      writeFileSync(join(root, 'eva.v1', 'song.json'), JSON.stringify(Object.fromEntries(texts.map((t) => [t, { tpl: 'whisper' }]))))
      writeFileSync(join(root, 'keyword.v1', 'song.json'), JSON.stringify(Object.fromEntries(texts.map((t, i) => [t, i === 0 ? 'line' : t]))))
      return [{ dir: join(root, 'eva.v1') }, { dir: join(root, 'keyword.v1'), as: 'kw' }]
    }
    const adopting: Grammar = { ...grammar, adopt: (byText) => ({ byText }) }

    it('is adopted instead of asking, merged across folders, and cached', async () => {
      const { llm, calls } = fakeLlm('ok')
      const cacheDir = dir()
      const d = createDirector({ cacheDir, llm, legacy: { eva: oldCache(['line 0', 'line 1', 'line 2', 'line 3']) } })
      d.register('eva', adopting)
      expect(await d.direct('eva', lines(4))).toEqual({
        byText: {
          'line 0': { tpl: 'whisper', kw: 'line' },
          'line 1': { tpl: 'whisper', kw: 'line 1' },
          'line 2': { tpl: 'whisper', kw: 'line 2' },
          'line 3': { tpl: 'whisper', kw: 'line 3' },
        },
      })
      expect(calls).toEqual([])
      expect(readdirSync(join(cacheDir, 'eva.v1'))).toHaveLength(1)
    })

    it('is ignored when it does not cover the content, so the LLM is asked', async () => {
      const { llm, calls } = fakeLlm('ok')
      const d = createDirector({ cacheDir: dir(), llm, legacy: { eva: oldCache(['line 0', 'line 1']) } })
      d.register('eva', adopting)
      expect(await d.direct('eva', lines(4))).toEqual({ out: 'ok' })
      expect(calls).toHaveLength(1)
    })
  })
})
