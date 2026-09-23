import { BrowserWindow, screen, type Rectangle } from 'electron'
import type { ShellWindow } from '@contract'
import type { Bounds, ShellPrefs } from './prefs'
import { resolveProfile } from './profiles'

export interface SurfaceState {
  theme: string
  clickThrough: boolean
  visible: boolean
  fullScreen: ShellWindow['fullScreen']
}

export interface SurfaceOptions {
  id: string
  preload: string
  prefs: ShellPrefs
  /** Where the other windows are, so a window without a saved place doesn't land on top of one. */
  others?: () => Bounds[]
}

const intersects = (a: Rectangle, b: Bounds) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
const inside = (b: Bounds, area: Rectangle) =>
  b.x >= area.x && b.y >= area.y && b.x + b.width <= area.x + area.width && b.y + b.height <= area.y + area.height
const GAP = 20
/** How long macOS gets to take a window into full screen before we assume it won't. */
const ENTER_MS = 1500
/** How soon after a window shows, or changes desktops, a move is macOS's, not the user's. */
const PUSH_MS = 1000
const same = (a: Bounds, b: Bounds) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height

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
 * user last left it for that theme), click-through, full screen, reset, hide.
 * Per-theme choices are persisted through ShellPrefs.
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
  // Floating on every desktop and over full-screen apps: 'floating' rather than 'screen-saver'
  // so menu-bar popovers still draw above us. While another echo window is full screen, this
  // one is pinned to the desktop it is on instead; echo being a menu-bar app, a window on every
  // desktop would also show in that window's Space, on top of it.
  let pinned = false
  const everywhere = (on: boolean) =>
    win.setVisibleOnAllWorkspaces(on, on ? { visibleOnFullScreen: true } : { skipTransformProcessType: true })
  const float = () => {
    win.setAlwaysOnTop(true, 'floating')
    everywhere(!pinned)
  }
  float()
  // Showing a window, or changing which desktops it is on, macOS answers by pushing a window
  // that hangs off the screen back on. The user left it half off on purpose (a big chime at
  // the edge), so after any such change it goes back where it was meant to be, and a move
  // that follows within PUSH_MS is taken as macOS's too. Placed, not remembered.
  let pushedAt = 0
  function holdPlace(change: () => void): void {
    pushedAt = Date.now()
    change()
    if (settled && !full) place(settled)
  }
  const reveal = () => holdPlace(() => win.showInactive())
  // What the user wants, which is not the same as isVisible() while the page is still loading.
  let shown = true
  win.once('ready-to-show', () => {
    if (shown) reveal()
  })

  let theme = ''
  let profile = ''
  let clickThrough = false
  /** Where we last put the window ourselves. Our own setBounds fires moved/resized too, sometimes late. */
  let placed: Bounds | null = null
  /** Where the window is meant to be: where we placed it, or where the user last left it. */
  let settled: Bounds | null = null
  /** From asking for full screen until it has been left: its bounds are macOS's, not a place to keep. */
  let full = false
  const listeners = new Set<() => void>()
  const changed = () => {
    for (const listener of listeners) listener()
  }

  function place(bounds: Bounds): void {
    placed = { ...bounds }
    settled = { ...bounds }
    win.setBounds(bounds)
  }
  function setClickThrough(value: boolean): void {
    clickThrough = value
    win.setIgnoreMouseEvents(value, { forward: true })
  }
  const workAreaHere = () => screen.getDisplayMatching(win.getBounds()).workArea

  // The user moved or resized the window: remember it for this theme. Only where the
  // user put it, never where we did: a fill saved as the user's place would come back
  // after a restart as a full-screen window with no way back.
  const remember = () => {
    if (!theme || full || (placed && same(win.getBounds(), placed))) return
    // macOS may push a window back on screen a moment after the change: that isn't the user either.
    if (settled && Date.now() - pushedAt < PUSH_MS) return place(settled)
    placed = null
    settled = win.getBounds()
    prefs.setOverride(id, theme, { bounds: settled })
    changed()
  }
  win.on('moved', remember)
  win.on('resized', remember)
  win.on('show', changed)
  win.on('hide', changed)

  // In its Space it is an ordinary window; back on the desktop it floats again, where the
  // current theme wants it (the theme may have changed while it was full screen).
  const afterLeaving: (() => void)[] = []
  const settle = () => {
    win.setAlwaysOnTop(false)
    everywhere(false)
  }
  // Full screen asked for some other way (macOS's own menu or gestures): catch up.
  win.on('enter-full-screen', () => {
    if (full) return
    full = true
    settle()
    changed()
  })
  win.on('leave-full-screen', () => {
    full = false
    float()
    wear(theme, profile)
    for (const then of afterLeaving.splice(0)) then()
  })
  function setFullScreen(on: boolean): void {
    if (on === full) return
    full = on
    if (on) settle()
    win.setFullScreen(on)
    changed()
    // macOS may decline (it does for some borderless windows): don't sit in a full screen that never came.
    if (on) {
      setTimeout(() => {
        if (!full || win.isDestroyed() || win.isFullScreen()) return
        console.warn(`[shell] ${id} did not go full screen`)
        full = false
        float()
        changed()
      }, ENTER_MS)
    }
  }
  /** Out of full screen first, if it is, then do this. */
  function onDesktop(then: () => void): void {
    if (!full) return then()
    afterLeaving.push(then)
    setFullScreen(false)
  }

  /** Put on a theme: its profile, unless the user left this window somewhere else for it. */
  function wear(nextTheme: string, nextProfile: string): void {
    theme = nextTheme
    profile = nextProfile
    // The profile is laid out on the display the window is on (the primary one, for a new window),
    // so re-theming or resetting a window on a second monitor keeps it there.
    const area = workAreaHere()
    const base = resolveProfile(profile, area)
    const saved = prefs.override(id, theme)
    // A saved position on a display that is no longer there falls back to the profile.
    const onScreen = !!saved.bounds && screen.getAllDisplays().some((d) => intersects(d.workArea, saved.bounds!))
    // In full screen the Space decides its size; it is placed when it comes back.
    if (!full) place(onScreen ? saved.bounds! : clear(base, others(), area))
    setClickThrough(saved.clickThrough ?? base.clickThrough)
    changed()
  }

  return {
    win,
    wear,

    toggleClickThrough(): void {
      setClickThrough(!clickThrough)
      prefs.setOverride(id, theme, { clickThrough })
      changed()
    },

    /** Full screen in a Space of its own, as a Chrome window goes; not remembered across restarts. */
    setFullScreen,

    /** Stay on the desktop it is on (while another window is full screen), or float on every one again. */
    pin(on: boolean): void {
      if (pinned === on) return
      pinned = on
      if (!full) holdPlace(() => everywhere(!on))
    },

    focused(): boolean {
      return win.isFocused()
    },

    /** Forget what the user changed for the current theme and go back to its profile. */
    reset(): void {
      prefs.clearOverride(id, theme)
      onDesktop(() => wear(theme, profile))
    },

    toggleVisible(): void {
      shown = !shown
      if (shown) reveal()
      else onDesktop(() => win.hide())
    },

    bounds(): Bounds {
      return win.getBounds()
    },

    state(): SurfaceState {
      return { theme, clickThrough, visible: shown, fullScreen: full }
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
