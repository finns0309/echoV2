import type { JsonStore } from '@server/foundation/store'

export interface SurfacePref {
  id: string
  theme: string
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

// Display preferences: which surfaces exist, which theme each wears, and what
// the user changed about each window per theme. The shell is their only writer.
export function createShellPrefs(store: JsonStore, defaults: SurfacePref[]) {
  const SURFACES = 'surfaces'
  const OVERRIDES = 'window-overrides'
  let prefs = store.get<SurfacePref[]>(SURFACES, defaults)
  let overrides = store.get<Overrides>(OVERRIDES, {})
  const listeners = new Set<() => void>()

  const saveOverrides = () => store.set(OVERRIDES, overrides)

  return {
    get(): readonly SurfacePref[] {
      return prefs
    },
    setTheme(surface: string, theme: string): void {
      prefs = prefs.map((p) => (p.id === surface ? { ...p, theme } : p))
      store.set(SURFACES, prefs)
      for (const listener of listeners) listener()
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
