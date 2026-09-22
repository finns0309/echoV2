import { describe, expect, it } from 'vitest'
import type { Content } from '@contract'
import { createMemoryStore } from '@server/foundation/store'
import { createContentStore } from './contents'
import { waitingOrder } from './scheduler'

const card = (id: string, createdAt: number, text = id): Content => ({
  id,
  pack: 'card',
  kind: 'word',
  priority: 'normal',
  createdAt,
  presentation: { context: {}, timeline: { kind: 'self' }, blocks: [{ type: 'text', role: 'primary', text }] },
})

describe('content store', () => {
  it('keeps an updated card in its place in line', () => {
    const contents = createContentStore(createMemoryStore(), () => 0)
    contents.upsert(card('a', 1))
    contents.upsert(card('b', 2))
    contents.upsert(card('a', 3, 'a, edited')) // re-sent while waiting
    const line = [...contents.list()].sort(waitingOrder)
    expect(line.map((c) => c.id)).toEqual(['a', 'b'])
    expect(line[0]!.presentation.blocks[0]).toMatchObject({ text: 'a, edited' })
    expect(line[0]!.createdAt).toBe(1)
  })
})
