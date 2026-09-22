import { BrowserWindow, screen, type Rectangle } from 'electron'
import type { Bounds, ShellPrefs } from './prefs'
import { resolveProfile } from './profiles'

export type FillState = 'normal' | 'restorable' | 'full'

export interface SurfaceState {
  theme: string
  clickThrough: boolean
  visible: boolean
  fill: FillState
}

export interface SurfaceOptions {
  id: string
  preload: string
  prefs: ShellPrefs
  /** Where the other windows are, so a window without a saved place doesn't land on top of one. */
  others?: () => Bounds[]
}

// Programmatic setBounds fires moved/resized too; ignore those for this long
// so our own changes aren't saved as the user's preference.
const QUIET_MS = 400

const intersects = (a: Rectangle, b: Bounds) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
const inside = (b: Bounds, area: Rectangle) =>
  b.x >= area.x && b.y >= area.y && b.x + b.width <= area.x + area.width && b.y + b.height <= area.y + area.height
const GAP = 20

/** Slide `b` left, a window's width at a time, until it clears `taken` or runs out of room. */
function clear(b: Bounds, taken: Bounds[], area: Rectangle): Bounds {
  let at = b
  while (taken.some((t) => intersects(at, t))) {
    const next = { ...at, x: at.x - at.width - GAP }
    if (!inside(next, area)) return b
    at = next
  }
  return at
}

/**
 * One transparent, frameless, always-on-top window hosting a screen, plus
 * everything the user can do to it: wear a theme (profile bounds, or where the
 * user last left it for that theme), click-through, fill the screen, reset,
 * hide. Per-theme choices are persisted through ShellPrefs.
 */
export function createSurface({ id, preload, prefs, others = () => [] }: SurfaceOptions) {
  const win = new BrowserWindow({
    width: 300,
    height: 300,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    webPreferences: { preload, contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  // 'floating' rather than 'screen-saver' so menu-bar popovers still draw above us.
  win.setAlwaysOnTop(true, 'floating')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  // What the user wants, which is not the same as isVisible() while the page is still loading.
  let shown = true
  win.once('ready-to-show', () => {
    if (shown) win.showInactive()
  })

  let theme = ''
  let profile = ''
  let clickThrough = false
  let beforeFill: Bounds | null = null
  let quietUntil = 0
  const listeners = new Set<() => void>()
  const changed = () => {
    for (const listener of listeners) listener()
  }

  function place(bounds: Bounds): void {
    quietUntil = Date.now() + QUIET_MS
    win.setBounds(bounds)
  }
  function setClickThrough(value: boolean): void {
    clickThrough = value
    win.setIgnoreMouseEvents(value, { forward: true })
  }
  const workAreaHere = () => screen.getDisplayMatching(win.getBounds()).workArea
  const isFull = () => {
    const b = win.getBounds()
    const wa = workAreaHere()
    return b.x === wa.x && b.y === wa.y && b.width === wa.width && b.height === wa.height
  }

  // The user moved or resized the window: remember it for this theme.
  const remember = () => {
    if (Date.now() < quietUntil || !theme) return
    beforeFill = null
    prefs.setOverride(id, theme, { bounds: win.getBounds() })
    changed()
  }
  win.on('moved', remember)
  win.on('resized', remember)
  win.on('show', changed)
  win.on('hide', changed)

  return {
    win,

    /** Put on a theme: its profile, unless the user left this window somewhere else for it. */
    wear(nextTheme: string, nextProfile: string): void {
      theme = nextTheme
      profile = nextProfile
      beforeFill = null
      const area = screen.getPrimaryDisplay().workArea
      const base = resolveProfile(profile, area)
      const saved = prefs.override(id, theme)
      // A saved position on a display that is no longer there falls back to the profile.
      const onScreen = saved.bounds && screen.getAllDisplays().some((d) => intersects(d.workArea, saved.bounds!))
      place(onScreen ? saved.bounds! : clear(base, others(), area))
      setClickThrough(saved.clickThrough ?? base.clickThrough)
      changed()
    },

    toggleClickThrough(): void {
      setClickThrough(!clickThrough)
      prefs.setOverride(id, theme, { clickThrough })
      changed()
    },

    /** Fill the work area of the display the window is on; again to restore. Not remembered. */
    toggleFill(): void {
      if (beforeFill) {
        place(beforeFill)
        beforeFill = null
      } else if (!isFull()) {
        beforeFill = win.getBounds()
        place(workAreaHere())
      }
      changed()
    },

    /** Forget what the user changed for the current theme and go back to its profile. */
    reset(): void {
      prefs.clearOverride(id, theme)
      this.wear(theme, profile)
    },

    toggleVisible(): void {
      shown = !shown
      if (shown) win.showInactive()
      else win.hide()
    },

    bounds(): Bounds {
      return win.getBounds()
    },

    state(): SurfaceState {
      return { theme, clickThrough, visible: shown, fill: beforeFill ? 'restorable' : isFull() ? 'full' : 'normal' }
    },

    destroy(): void {
      listeners.clear()
      if (!win.isDestroyed()) win.destroy()
    },

    onChange(listener: () => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export type Surface = ReturnType<typeof createSurface>
