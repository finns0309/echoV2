import { randomUUID } from 'node:crypto'
import type { ContentPack, PackContext } from '@server/stage/pack-api'
import { toContent, type AcceptResult } from './model'

// The card pack: whatever agents send (words, facts, messages, statuses).
// It has no source of its own; the agent API hands it raw input through accept().
export function createCardPack(now: () => number = Date.now) {
  let ctx: PackContext | null = null

  const pack: ContentPack & {
    accept(raw: unknown): AcceptResult
    withdraw(id: string): boolean
  } = {
    id: 'card',
    kinds: ['card', 'word', 'fact', 'news', 'message', 'status'],
    start(context) {
      ctx = context
    },
    stop() {
      ctx = null
    },
    accept(raw) {
      if (!ctx) return { ok: false, error: 'card pack is not running' }
      const result = toContent(raw, now(), () => randomUUID().slice(0, 8))
      if (result.ok) ctx.upsert(result.content)
      return result
    },
    withdraw(id) {
      if (!ctx) return false
      ctx.remove(id.startsWith('card:') ? id : `card:${id}`)
      return true
    },
  }
  return pack
}

export type CardPack = ReturnType<typeof createCardPack>
