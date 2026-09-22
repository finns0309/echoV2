import type { Route } from '@contract'
import type { JsonStore } from '@server/foundation/store'

export interface SurfacePref {
  id: string
  /** The user's name for the window; stable across restarts, unlike nothing else about it. */
  name?: string
  theme: string
  /** What this window takes; absent means everything. */
  accepts?: Route
}

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

/** What the user changed about a surface while it wore a theme; absent = the theme's profile default. */
export interface WindowOverride {
  bounds?: Bounds
  clickThrough?: boolean
}

type Overrides = Record<string, Record<string, WindowOverride>> // surface → theme → override

// Display preferences: which surfaces exist, which theme each wears, what each
// takes, and what the user changed about each window per theme. The shell is
// their only writer.
export function createShellPrefs(store: JsonStore, defaults: SurfacePref[]) {
  const SURFACES = 'surfaces'
  const OVERRIDES = 'window-overrides'
  let prefs = store.get<SurfacePref[]>(SURFACES, defaults)
  let overrides = store.get<Overrides>(OVERRIDES, {})
  const listeners = new Set<() => void>()

  const saveOverrides = () => store.set(OVERRIDES, overrides)
  const save = (next: SurfacePref[]) => {
    prefs = next
    store.set(SURFACES, prefs)
    for (const listener of listeners) listener()
  }

  return {
    get(): readonly SurfacePref[] {
      return prefs
    },
    setTheme(surface: string, theme: string): void {
      save(prefs.map((p) => (p.id === surface ? { ...p, theme } : p)))
    },
    /** Undefined: the window takes everything. */
    setRoute(surface: string, accepts: Route | undefined): void {
      save(
        prefs.map((p) => {
          if (p.id !== surface) return p
          const next: SurfacePref = { ...p }
          if (accepts) next.accepts = accepts
          else delete next.accepts
          return next
        }),
      )
    },
    /** Names are unique; a name another window has is refused. */
    setName(surface: string, name: string): boolean {
      if (prefs.some((p) => p.id !== surface && p.name === name)) return false
      save(prefs.map((p) => (p.id === surface ? { ...p, name } : p)))
      return true
    },
    add(pref: SurfacePref): void {
      if (prefs.some((p) => p.id === pref.id)) return
      save([...prefs, pref])
    },
    /** Also forgets where that window was left. */
    remove(surface: string): void {
      if (!prefs.some((p) => p.id === surface)) return
      if (overrides[surface]) {
        const rest = { ...overrides }
        delete rest[surface]
        overrides = rest
        saveOverrides()
      }
      save(prefs.filter((p) => p.id !== surface))
    },
    onChange(listener: () => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    override(surface: string, theme: string): WindowOverride {
      return overrides[surface]?.[theme] ?? {}
    },
    setOverride(surface: string, theme: string, patch: WindowOverride): void {
      const current = overrides[surface]?.[theme] ?? {}
      overrides = { ...overrides, [surface]: { ...overrides[surface], [theme]: { ...current, ...patch } } }
      saveOverrides()
    },
    clearOverride(surface: string, theme: string): void {
      if (!overrides[surface]?.[theme]) return
      const rest = { ...overrides[surface] }
      delete rest[theme]
      overrides = { ...overrides, [surface]: rest }
      saveOverrides()
    },
  }
}

export type ShellPrefs = ReturnType<typeof createShellPrefs>
