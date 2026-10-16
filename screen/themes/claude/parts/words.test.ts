import { describe, expect, it } from 'vitest'
import { greeting, pick, THINKING } from './words'

const at = (iso: string) => new Date(iso)

describe('greeting', () => {
  it('follows the hour', () => {
    expect(greeting(at('2026-10-14T09:00'))).toBe('Coffee and Claude time?')
    expect(greeting(at('2026-10-15T09:00'))).toBe('Good morning')
    expect(greeting(at('2026-10-14T15:00'))).toBe('Good afternoon')
    expect(greeting(at('2026-10-14T20:00'))).toBe('Good evening')
    expect(greeting(at('2026-10-14T02:00'))).toBe('Hello, night owl')
  })

  it('knows Monday mornings and Friday afternoons', () => {
    expect(greeting(at('2026-10-12T09:00'))).toBe('Happy Monday')
    expect(greeting(at('2026-10-16T15:00'))).toBe('Happy Friday')
  })
})

describe('pick', () => {
  it('gives the same thing the same verb', () => {
    expect(pick(THINKING, 'card:ja-0142')).toBe(pick(THINKING, 'card:ja-0142'))
    expect(THINKING).toContain(pick(THINKING, 'anything'))
  })
})
