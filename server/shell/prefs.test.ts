import { describe, expect, it } from 'vitest'
import { createMemoryStore } from '@server/foundation/store'
import { createShellPrefs } from './prefs'

describe('shell prefs', () => {
  it('remembers window overrides per surface and theme, merging patches', () => {
    const store = createMemoryStore()
    const prefs = createShellPrefs(store, [{ id: 'main', theme: 'furin' }])
    prefs.setOverride('main', 'furin', { clickThrough: true })
    prefs.setOverride('main', 'furin', { bounds: { x: 1, y: 2, width: 3, height: 4 } })
    expect(prefs.override('main', 'furin')).toEqual({ clickThrough: true, bounds: { x: 1, y: 2, width: 3, height: 4 } })
    expect(prefs.override('main', 'plasma')).toEqual({})
    // persisted: a fresh instance over the same store sees it
    expect(createShellPrefs(store, []).override('main', 'furin').clickThrough).toBe(true)
  })

  it('resets one theme without touching the others', () => {
    const prefs = createShellPrefs(createMemoryStore(), [])
    prefs.setOverride('main', 'furin', { clickThrough: true })
    prefs.setOverride('main', 'eva', { clickThrough: false })
    prefs.clearOverride('main', 'furin')
    expect(prefs.override('main', 'furin')).toEqual({})
    expect(prefs.override('main', 'eva')).toEqual({ clickThrough: false })
  })

  it('adds, routes and removes surfaces, forgetting a removed window', () => {
    const store = createMemoryStore()
    const prefs = createShellPrefs(store, [{ id: 'main', theme: 'furin' }])
    let changes = 0
    prefs.onChange(() => changes++)
    prefs.add({ id: 'w2', theme: 'furin', accepts: { packs: ['card'] } })
    prefs.add({ id: 'w2', theme: 'plasma' }) // an existing id is left alone
    prefs.setRoute('main', { packs: ['music'] })
    prefs.setOverride('w2', 'furin', { clickThrough: true })
    expect(createShellPrefs(store, []).get()).toEqual([
      { id: 'main', theme: 'furin', accepts: { packs: ['music'] } },
      { id: 'w2', theme: 'furin', accepts: { packs: ['card'] } },
    ])
    prefs.setRoute('main', undefined)
    prefs.remove('w2')
    expect(prefs.get()).toEqual([{ id: 'main', theme: 'furin' }])
    expect(prefs.override('w2', 'furin')).toEqual({})
    expect(changes).toBe(4)
  })

  it('names windows uniquely and keeps the name when the route changes', () => {
    const prefs = createShellPrefs(createMemoryStore(), [
      { id: 'main', theme: 'furin', name: 'main' },
      { id: 'w2', theme: 'furin' },
    ])
    expect(prefs.setName('w2', 'main')).toBe(false)
    expect(prefs.setName('w2', 'right')).toBe(true)
    prefs.setRoute('w2', { packs: ['card'] })
    prefs.setRoute('w2', undefined)
    expect(prefs.get()[1]).toEqual({ id: 'w2', theme: 'furin', name: 'right' })
  })
})

