import type { Route, ShellCommand, ShellState, ShellWindow } from '@contract'
import type { SurfaceConfig } from '@server/stage/routing'
import type { Bounds, ShellPrefs } from './prefs'
import type { SurfaceState } from './surfaces'

/** What the control needs from a window; the Electron-backed one is createSurface. */
export interface ShellSurface {
  wear(theme: string, profile: string): void
  state(): SurfaceState
  bounds(): Bounds
  onChange(listener: () => void): () => void
  toggleClickThrough(): void
  setFullScreen(on: boolean): void
  /** Stay on the current desktop instead of every one, so a full-screen window's Space stays its own. */
  pin(on: boolean): void
  focused(): boolean
  /** Which display it is on. */
  display(): number
  toggleVisible(): void
  reset(): void
  destroy(): void
}

export interface ShellControlOptions {
  prefs: ShellPrefs
  /** Themes and the window profile each one wears. */
  themes: readonly { id: string; label: string; profile: string }[]
  defaultTheme: string
  /** What a window can be told to take; the first one is "everything". */
  routes: readonly { id: string; label: string; accepts?: Route }[]
  /** Names a window can be given, besides the default winN. */
  names: readonly string[]
  /** The fallback window's id; it always exists. */
  main: string
  /**
   * Open a window for a surface id; `others` says where the other windows are, so a
   * new one can keep clear of them. The control wears it and destroys it.
   */
  open: (id: string, others: () => Bounds[]) => ShellSurface
  newId?: () => string
}

export type CommandResult = { ok: true } | { ok: false; error: string }

/**
 * The shell's single writer: owns the windows, keeps them in step with the prefs,
 * and carries out every ShellCommand. The tray and the panel are views of it, and
 * the stage subscribes too: a window hiding, appearing or closing reroutes content.
 */
export function createShellControl(o: ShellControlOptions) {
  const { prefs } = o
  const windows = new Map<string, ShellSurface>()
  const listeners = new Set<(state: ShellState) => void>()
  // Time plus a counter, so two windows added within one millisecond still differ.
  let seq = 0
  const newId = o.newId ?? (() => `win-${Date.now().toString(36)}${(seq++).toString(36)}`)

  const theme = (id: string) => o.themes.find((t) => t.id === id) ?? o.themes.find((t) => t.id === o.defaultTheme)
  const routeOf = (accepts: Route | undefined) =>
    o.routes.find((r) => JSON.stringify(r.accepts) === JSON.stringify(accepts))?.id ?? o.routes[0]?.id ?? 'all'
  const acceptsOf = (route: string) => o.routes.find((r) => r.id === route)?.accepts

  // Every window has a name: main is its id; others default to win2, win3, ... until renamed.
  const nextName = () => {
    const taken = new Set(prefs.get().map((p) => p.name))
    let n = 2
    while (taken.has(`win${n}`)) n++
    return `win${n}`
  }
  for (const p of prefs.get()) if (!p.name) prefs.setName(p.id, p.id === o.main ? o.main : nextName())

  function state(): ShellState {
    return {
      windows: prefs.get().flatMap((p): ShellWindow[] => {
        const w = windows.get(p.id)
        if (!w) return []
        const s = w.state()
        return [
          {
            id: p.id,
            name: p.name ?? p.id,
            theme: s.theme,
            route: routeOf(p.accepts),
            visible: s.visible,
            clickThrough: s.clickThrough,
            fullScreen: s.fullScreen,
            loudness: p.loudness ?? 'attention',
            main: p.id === o.main,
          },
        ]
      }),
      themes: o.themes.map(({ id, label }) => ({ id, label })),
      routes: o.routes.map(({ id, label }) => ({ id, label })),
      names: [...o.names],
    }
  }

  const changed = () => {
    const s = state()
    for (const listener of listeners) listener(s)
  }
  // Once no window is full screen, the others float on every desktop again. (They are pinned
  // before one goes full screen, in dispatch: pinned while its Space shows, they would land in it.)
  const windowChanged = () => {
    if (![...windows.values()].some((w) => w.state().fullScreen)) for (const w of windows.values()) w.pin(false)
    changed()
  }

  /** What the scheduler sees: each window's theme, route, and whether it is showing. */
  function surfaces(): SurfaceConfig[] {
    return prefs.get().flatMap((p) => {
      const t = theme(p.theme)
      if (!t) return []
      return [
        {
          id: p.id,
          ...(p.name ? { name: p.name } : {}),
          theme: t.id,
          profile: t.profile,
          ...(p.accepts ? { accepts: p.accepts } : {}),
          ...(p.id === o.main ? { fallback: true } : {}),
          ...(windows.get(p.id)?.state().visible === false ? { hidden: true } : {}),
          ...(p.loudness ? { loudness: p.loudness } : {}),
        },
      ]
    })
  }

  // Windows follow the prefs: opened, re-themed and closed as they change.
  function reconcile(): void {
    const wanted = surfaces()
    for (const s of wanted) {
      let w = windows.get(s.id)
      if (!w) {
        const id = s.id
        w = o.open(id, () => [...windows].flatMap(([other, x]) => (other === id ? [] : [x.bounds()])))
        windows.set(id, w)
        w.onChange(windowChanged)
        w.wear(s.theme, s.profile)
      } else if (w.state().theme !== s.theme) {
        w.wear(s.theme, s.profile)
      }
    }
    for (const [id, w] of windows) {
      if (wanted.some((s) => s.id === id)) continue
      windows.delete(id)
      w.destroy()
    }
    changed()
  }

  function dispatch(command: ShellCommand): CommandResult {
    const known = (id: string) => prefs.get().some((p) => p.id === id)
    const surface = (id: string) => windows.get(id)
    if (command.type === 'addWindow') {
      const t = command.theme ?? prefs.get().at(-1)?.theme ?? o.defaultTheme
      if (!theme(t)) return { ok: false, error: `no theme ${t}` }
      prefs.add({ id: newId(), name: nextName(), theme: t })
      return { ok: true }
    }
    if (!known(command.window)) return { ok: false, error: `no window ${command.window}` }
    switch (command.type) {
      case 'setTheme':
        if (!o.themes.some((t) => t.id === command.theme)) return { ok: false, error: `no theme ${command.theme}` }
        prefs.setTheme(command.window, command.theme)
        return { ok: true }
      case 'setRoute':
        if (!o.routes.some((r) => r.id === command.route)) return { ok: false, error: `no route ${command.route}` }
        prefs.setRoute(command.window, acceptsOf(command.route))
        return { ok: true }
      case 'rename':
        if (command.window === o.main) return { ok: false, error: `${o.main} keeps its name` }
        return prefs.setName(command.window, command.name) ? { ok: true } : { ok: false, error: `${command.name} is taken` }
      case 'closeWindow':
        if (command.window === o.main) return { ok: false, error: `${o.main} can't be closed` }
        prefs.remove(command.window)
        return { ok: true }
      // The window only knows how to flip; flip when it isn't already what was asked for.
      case 'setVisible': {
        const w = surface(command.window)
        if (w && w.state().visible !== command.on) w.toggleVisible()
        return { ok: true }
      }
      case 'setClickThrough': {
        const w = surface(command.window)
        if (w && w.state().clickThrough !== command.on) w.toggleClickThrough()
        return { ok: true }
      }
      case 'setFullScreen':
        // Only windows on the same display: with a Space per display, the full-screen Space
        // covers just its own, and a window pinned elsewhere would stop following its desktops.
        if (command.on) {
          const at = surface(command.window)?.display()
          for (const [id, w] of windows) if (id !== command.window && w.display() === at) w.pin(true)
        }
        surface(command.window)?.setFullScreen(command.on)
        return { ok: true }
      case 'resetWindow':
        surface(command.window)?.reset()
        return { ok: true }
      case 'setLoudness':
        prefs.setLoudness(command.window, command.loudness)
        return { ok: true }
    }
  }

  return {
    /** Open the windows and keep them in step with the prefs from here on. */
    start(): void {
      prefs.onChange(reconcile)
      reconcile()
    },
    state,
    surfaces,
    dispatch,
    /** The window with the keyboard, if one of echo's has it. */
    focused(): string | null {
      return [...windows].find(([, w]) => w.focused())?.[0] ?? null
    },
    subscribe(listener: (state: ShellState) => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export type ShellControl = ReturnType<typeof createShellControl>
