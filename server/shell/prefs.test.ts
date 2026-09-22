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
})
