// L2 director service: asks an LLM how a theme should stage a presentation,
// using the theme's own grammar. Owns caching (by content hash, on disk),
// de-duplication of concurrent asks, and failure semantics: any failure returns
// null and is not cached, so the next ask retries. It never blocks display;
// themes run their heuristic until an answer arrives.
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Grammar, Presentation } from '@contract'

/** The one thing the director needs from an LLM. Implemented by a provider, injected by cmd/display. */
export interface LlmClient {
  complete(req: { instructions: string; input: string }): Promise<string>
}

export interface DirectorOptions {
  cacheDir: string
  llm: LlmClient | null
  /** Content with fewer text blocks than this is left to the theme's heuristic. */
  minBlocks?: number
  log?: (message: string) => void
}

export function createDirector({ cacheDir, llm, minBlocks = 4, log = () => {} }: DirectorOptions) {
  const grammars = new Map<string, Grammar>()
  const memory = new Map<string, unknown>()
  const inflight = new Map<string, Promise<unknown>>()

  async function ask(key: string, file: string, grammar: Grammar, presentation: Presentation, input: string): Promise<unknown> {
    if (!llm) return null
    const started = Date.now()
    try {
      const output = await llm.complete({ instructions: grammar.instructions, input })
      const value = grammar.parse(output, presentation)
      if (value == null) throw new Error('unusable output')
      mkdirSync(join(file, '..'), { recursive: true })
      writeFileSync(file, JSON.stringify(value))
      memory.set(key, value)
      log(`[director] ${key} in ${Date.now() - started}ms`)
      return value
    } catch (err) {
      log(`[director] ${key} failed: ${err instanceof Error ? err.message : String(err)}`)
      return null
    }
  }

  return {
    register(theme: string, grammar: Grammar): void {
      grammars.set(theme, grammar)
    },

    /** Directions for `presentation` on `theme`, or null when there are none (yet). */
    async direct(theme: string, presentation: Presentation): Promise<unknown> {
      const grammar = grammars.get(theme)
      if (!grammar) return null
      if (presentation.blocks.filter((b) => b.type === 'text').length < minBlocks) return null
      const prep = grammar.prepare(presentation)
      if (!prep) return null

      const hash = createHash('sha1').update(prep.key).digest('hex').slice(0, 16)
      const key = `${theme}.v${grammar.version}.${hash}`
      if (memory.has(key)) return memory.get(key)
      const file = join(cacheDir, `${theme}.v${grammar.version}`, `${hash}.json`)
      try {
        const cached: unknown = JSON.parse(readFileSync(file, 'utf8'))
        memory.set(key, cached)
        return cached
      } catch {
        // not cached yet
      }

      const pending = inflight.get(key)
      if (pending) return pending
      const p = ask(key, file, grammar, presentation, prep.input).finally(() => inflight.delete(key))
      inflight.set(key, p)
      return p
    },
  }
}

export type Director = ReturnType<typeof createDirector>
