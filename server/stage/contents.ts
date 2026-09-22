import type { Content } from '@contract'
import type { JsonStore } from '@server/foundation/store'

// The content store: the only writer of "what content exists". Packs upsert and
// remove through it; the scheduler reads it. Persisted, so queued cards survive
// a restart.
export function createContentStore(store: JsonStore, now: () => number) {
  const KEY = 'contents'
  const items = new Map<string, Content>()
  for (const c of store.get<Content[]>(KEY, [])) items.set(c.id, c)
  const listeners = new Set<() => void>()

  const changed = () => {
    store.set(KEY, [...items.values()])
    for (const listener of listeners) listener()
  }

  return {
    /** An update keeps the content's place in line: createdAt stays the first one. */
    upsert(content: Content): void {
      const prev = items.get(content.id)
      items.set(content.id, prev ? { ...content, createdAt: prev.createdAt } : content)
      changed()
    },

    remove(id: string): boolean {
      const existed = items.delete(id)
      if (existed) changed()
      return existed
    },

    get(id: string): Content | undefined {
      return items.get(id)
    },

    /** Live contents; anything past its expiresAt is dropped on the way out. */
    list(): Content[] {
      const t = now()
      let expired = false
      for (const [id, c] of items) {
        if (c.expiresAt !== undefined && c.expiresAt <= t) {
          items.delete(id)
          expired = true
        }
      }
      if (expired) changed()
      return [...items.values()]
    },

    onChange(listener: () => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export type ContentStore = ReturnType<typeof createContentStore>
