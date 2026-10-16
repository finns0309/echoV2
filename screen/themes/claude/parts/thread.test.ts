import { describe, expect, it } from 'vitest'
import type { Block, OnAir } from '@contract'
import { ago, remember, revise, topicOf } from './thread'

const line = (text: string): Block => ({ type: 'text', role: 'primary', text })
const card = (contentId: string, since: number, context: OnAir['presentation']['context'], text = 'hi'): OnAir => ({
  contentId,
  since,
  presentation: { context, timeline: { kind: 'self' }, blocks: [line(text)] },
})

describe('topics', () => {
  it('keeps a conversation per title, else per speaker', () => {
    expect(topicOf(card('a', 0, { title: '今日の単語' }))).toEqual({ key: 'title:今日の単語', name: '今日の単語' })
    expect(topicOf(card('b', 0, { speaker: { name: 'Claude' } }))).toEqual({ key: 'speaker:Claude', name: 'Claude' })
  })

  it('names an untitled card by how it starts, as a new chat is named', () => {
    const t = topicOf(card('c', 0, {}, 'Tests all green. Ship it to production today?'))
    expect(t.key).toBe('card:c')
    expect(t.name).toBe('Tests all green. …')
  })
})

describe('remembering', () => {
  it('adds a reply to its conversation and brings that conversation to the front', () => {
    let c = remember([], card('w1', 1, { title: '単語' }))
    c = remember(c, card('n1', 2, { title: 'ニュース' }))
    c = remember(c, card('w2', 3, { title: '単語' }))
    expect(c.map((x) => x.name)).toEqual(['単語', 'ニュース'])
    expect(c[0]!.turns.map((t) => t.contentId)).toEqual(['w1', 'w2'])
    expect(c[0]!.updated).toBe(3)
  })

  it('moves a card said again to the end instead of repeating it', () => {
    let c = remember([], card('w1', 1, { title: '単語' }))
    c = remember(c, card('w2', 2, { title: '単語' }))
    c = remember(c, card('w1', 3, { title: '単語' }))
    expect(c[0]!.turns.map((t) => [t.contentId, t.at])).toEqual([
      ['w2', 2],
      ['w1', 3],
    ])
  })

  it('revises a reply in place', () => {
    const c = revise(remember([], card('s', 1, { title: 'CI' }, '3 failing')), card('s', 1, { title: 'CI' }, '1 failing'))
    expect(c[0]!.turns[0]!.blocks).toEqual([line('1 failing')])
  })
})

describe('ago', () => {
  it('says it the way Recents do', () => {
    const now = 10 * 3_600_000
    expect(ago(now - 20_000, now)).toBe('just now')
    expect(ago(now - 5 * 60_000, now)).toBe('5 min ago')
    expect(ago(now - 3 * 3_600_000, now)).toBe('3 hr ago')
  })
})
