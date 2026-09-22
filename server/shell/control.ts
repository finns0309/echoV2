import type { Route, ShellCommand, ShellState, ShellWindow } from '@contract'
import type { SurfaceConfig } from '@server/stage/scheduler'
import type { ShellPrefs } from './prefs'
import type { SurfaceState } from './surfaces'

/** What the control needs from a window; the Electron-backed one is createSurface. */
export interface ShellSurface {
  wear(theme: string, profile: string): void
  state(): SurfaceState
  onChange(listener: () => void): () => void
  toggleClickThrough(): void
  toggleFill(): void
  toggleVisible(): void
  reset(): void
  destroy(): void
}

export interface Preset {
  id: string
  label: string
  /** The windows it lays out, main first. A missing theme keeps the window's current one. */
  windows: { theme?: string; route: string }[]
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
  presets: readonly Preset[]
  /** The fallback window's id; it always exists. */
  main: string
  /** Open a window for a surface id. The control wears it and destroys it. */
  open: (id: string) => ShellSurface
  /** Something about the windows changed that the stage should know (a window hid, appeared, closed). */
  onWindowsChanged: () => void
  newId?: () => string
}

export type CommandResult = { ok: true } | { ok: false; error: string }

/**
 * The shell's single writer: owns the windows, keeps them in step with the prefs,
 * and carries out every ShellCommand. The tray and the panel are views of it.
 */
export function createShellControl(o: ShellControlOptions) {
  const { prefs } = o
  const windows = new Map<string, ShellSurface>()
  const listeners = new Set<(state: ShellState) => void>()
  const newId = o.newId ?? (() => `win-${Date.now().toString(36)}`)

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
            fill: s.fill,
            main: p.id === o.main,
          },
        ]
      }),
      themes: o.themes.map(({ id, label }) => ({ id, label })),
      routes: o.routes.map(({ id, label }) => ({ id, label })),
      names: [...o.names],
      presets: o.presets.map(({ id, label }) => ({ id, label })),
    }
  }

  const changed = () => {
    const s = state()
    for (const listener of listeners) listener(s)
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
        w = o.open(s.id)
        windows.set(s.id, w)
        w.onChange(() => {
          changed()
          o.onWindowsChanged() // hiding or showing a window reroutes content
        })
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
    o.onWindowsChanged()
  }

  function applyPreset(preset: Preset): void {
    const [first, ...rest] = preset.windows
    if (!first) return
    if (first.theme) prefs.setTheme(o.main, first.theme)
    prefs.setRoute(o.main, acceptsOf(first.route))
    const extras = prefs.get().filter((p) => p.id !== o.main)
    rest.forEach((spec, i) => {
      const existing = extras[i]
      if (existing) {
        if (spec.theme) prefs.setTheme(existing.id, spec.theme)
        prefs.setRoute(existing.id, acceptsOf(spec.route))
      } else {
        const accepts = acceptsOf(spec.route)
        prefs.add({ id: newId(), name: nextName(), theme: spec.theme ?? o.defaultTheme, ...(accepts ? { accepts } : {}) })
      }
    })
    for (const p of extras.slice(rest.length)) prefs.remove(p.id)
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
    if (command.type === 'applyPreset') {
      const preset = o.presets.find((p) => p.id === command.preset)
      if (!preset) return { ok: false, error: `no preset ${command.preset}` }
      applyPreset(preset)
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
      case 'toggleVisible':
        surface(command.window)?.toggleVisible()
        return { ok: true }
      case 'toggleClickThrough':
        surface(command.window)?.toggleClickThrough()
        return { ok: true }
      case 'toggleFill':
        surface(command.window)?.toggleFill()
        return { ok: true }
      case 'resetWindow':
        surface(command.window)?.reset()
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
    subscribe(listener: (state: ShellState) => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export type ShellControl = ReturnType<typeof createShellControl>
