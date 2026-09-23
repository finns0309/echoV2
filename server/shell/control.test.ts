import { describe, expect, it } from 'vitest'
import { createMemoryStore } from '@server/foundation/store'
import { createShellControl, type ShellSurface } from './control'
import { createShellPrefs } from './prefs'
import type { SurfaceState } from './surfaces'

// A window that only remembers what was done to it.
function fakeSurface(log: string[], id: string): ShellSurface {
  const s: SurfaceState = { theme: '', clickThrough: false, visible: true, fullScreen: false }
  const listeners = new Set<() => void>()
  const changed = () => listeners.forEach((l) => l())
  let pinned = false
  return {
    wear: (theme) => {
      s.theme = theme
      log.push(`wear ${id} ${theme}`)
    },
    state: () => ({ ...s }),
    bounds: () => ({ x: 0, y: 0, width: 300, height: 470 }),
    onChange: (l) => (listeners.add(l), () => listeners.delete(l)),
    toggleClickThrough: () => ((s.clickThrough = !s.clickThrough), changed()),
    setFullScreen: (on) => ((s.fullScreen = on), log.push(`full ${id} ${on}`), changed()),
    pin: (on) => void (pinned !== on && ((pinned = on), log.push(`pin ${id} ${on}`))),
    focused: () => false,
    // everything on one display, but a window called 'far' on another
    display: () => (id === 'far' ? 2 : 1),
    toggleVisible: () => ((s.visible = !s.visible), changed()),
    reset: () => log.push(`reset ${id}`),
    destroy: () => log.push(`destroy ${id}`),
  }
}

function setup(initial = [{ id: 'main', theme: 'furin' }]) {
  const log: string[] = []
  let n = 0
  const prefs = createShellPrefs(createMemoryStore(), initial)
  const shell = createShellControl({
    prefs,
    themes: [
      { id: 'furin', label: '风铃', profile: 'hanging' },
      { id: 'plasma', label: '流体', profile: 'ambient' },
    ],
    defaultTheme: 'furin',
    routes: [
      { id: 'all', label: '全部' },
      { id: 'music', label: '歌词', accepts: { packs: ['music'] } },
      { id: 'card', label: '卡片', accepts: { packs: ['card'] } },
    ],
    names: ['left', 'right'],
    main: 'main',
    open: (id) => {
      log.push(`open ${id}`)
      return fakeSurface(log, id)
    },
    newId: () => `w${++n}`,
  })
  let changes = 0
  shell.subscribe(() => changes++)
  shell.start()
  return { shell, log, prefs, changes: () => changes }
}

describe('shell control', () => {
  it('opens a window per pref and reports it', () => {
    const { shell, log } = setup()
    expect(log).toEqual(['open main', 'wear main furin'])
    expect(shell.state().windows).toEqual([
      { id: 'main', name: 'main', theme: 'furin', route: 'all', visible: true, clickThrough: false, fullScreen: false, loudness: 'attention', main: true },
    ])
  })

  it('adds, re-themes, routes, renames and closes windows through commands', () => {
    const { shell, log } = setup()
    expect(shell.dispatch({ type: 'addWindow', theme: 'plasma' })).toEqual({ ok: true })
    expect(log.slice(-2)).toEqual(['open w1', 'wear w1 plasma'])
    expect(shell.dispatch({ type: 'setRoute', window: 'w1', route: 'card' })).toEqual({ ok: true })
    expect(shell.dispatch({ type: 'rename', window: 'w1', name: 'left' })).toEqual({ ok: true })
    shell.dispatch({ type: 'setTheme', window: 'w1', theme: 'furin' })
    expect(shell.state().windows[1]).toMatchObject({ id: 'w1', name: 'left', theme: 'furin', route: 'card', main: false })
    expect(shell.surfaces()[1]).toMatchObject({ id: 'w1', name: 'left', profile: 'hanging', accepts: { packs: ['card'] } })
    shell.dispatch({ type: 'closeWindow', window: 'w1' })
    expect(log.at(-1)).toBe('destroy w1')
    expect(shell.state().windows).toHaveLength(1)
  })

  it('names new windows win2, win3, ... and keeps names unique', () => {
    const { shell } = setup()
    shell.dispatch({ type: 'addWindow' })
    shell.dispatch({ type: 'addWindow' })
    expect(shell.state().windows.map((w) => w.name)).toEqual(['main', 'win2', 'win3'])
    expect(shell.dispatch({ type: 'rename', window: 'w2', name: 'win2' })).toEqual({ ok: false, error: 'win2 is taken' })
  })

  it('protects main and refuses what it does not know', () => {
    const { shell } = setup()
    expect(shell.dispatch({ type: 'closeWindow', window: 'main' }).ok).toBe(false)
    expect(shell.dispatch({ type: 'rename', window: 'main', name: 'left' }).ok).toBe(false)
    expect(shell.dispatch({ type: 'setTheme', window: 'nope', theme: 'furin' }).ok).toBe(false)
    expect(shell.dispatch({ type: 'setTheme', window: 'main', theme: 'nope' }).ok).toBe(false)
  })

  it('tells the stage when a window hides, and marks it hidden', () => {
    const { shell, changes } = setup()
    const before = changes()
    shell.dispatch({ type: 'setVisible', window: 'main', on: false })
    expect(changes()).toBe(before + 1)
    shell.dispatch({ type: 'setVisible', window: 'main', on: false }) // already hidden: nothing happens
    expect(changes()).toBe(before + 1)
    expect(shell.surfaces()[0]).toMatchObject({ hidden: true, fallback: true })
  })

  it('names windows that came from older prefs', () => {
    const { shell } = setup([
      { id: 'main', theme: 'furin' },
      { id: 'old', theme: 'plasma' },
    ])
    expect(shell.state().windows.map((w) => w.name)).toEqual(['main', 'win2'])
  })

  it('sets switches to what was asked', () => {
    const { shell } = setup()
    shell.dispatch({ type: 'setClickThrough', window: 'main', on: true })
    shell.dispatch({ type: 'setClickThrough', window: 'main', on: true })
    expect(shell.state().windows[0]?.clickThrough).toBe(true)
    shell.dispatch({ type: 'setClickThrough', window: 'main', on: false })
    expect(shell.state().windows[0]?.clickThrough).toBe(false)
    shell.dispatch({ type: 'setFullScreen', window: 'main', on: true })
    expect(shell.state().windows[0]?.fullScreen).toBe(true)
  })

  it('keeps the other windows on the desktop while one is full screen, so its Space is its own', () => {
    const { shell, log } = setup([
      { id: 'main', theme: 'furin' },
      { id: 'side', theme: 'plasma' },
    ])
    log.length = 0
    shell.dispatch({ type: 'setFullScreen', window: 'main', on: true })
    // pinned first: pinned while the Space shows, it would land in it
    expect(log).toEqual(['pin side true', 'full main true'])
    log.length = 0
    shell.dispatch({ type: 'setFullScreen', window: 'main', on: false })
    expect(log).toEqual(['full main false', 'pin side false'])
  })

  it('leaves windows on another display alone: the full-screen Space covers only its own', () => {
    const { shell, log } = setup([
      { id: 'main', theme: 'furin' },
      { id: 'far', theme: 'plasma' },
    ])
    log.length = 0
    shell.dispatch({ type: 'setFullScreen', window: 'main', on: true })
    expect(log).toEqual(['full main true'])
  })

  it('caps a window\'s loudness, and tells the stage', () => {
    const { shell } = setup()
    expect(shell.state().windows[0]?.loudness).toBe('attention')
    shell.dispatch({ type: 'setLoudness', window: 'main', loudness: 'quiet' })
    expect(shell.state().windows[0]?.loudness).toBe('quiet')
    expect(shell.surfaces()[0]?.loudness).toBe('quiet')
    shell.dispatch({ type: 'setLoudness', window: 'main', loudness: 'attention' })
    expect(shell.surfaces()[0]).not.toHaveProperty('loudness')
  })
})

