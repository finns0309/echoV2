import type { JsonStore } from '@server/foundation/store'

export interface SurfacePref {
  id: string
  theme: string
}

// Display preferences: which surfaces exist and which theme each one wears.
// The shell is their only writer.
export function createShellPrefs(store: JsonStore, defaults: SurfacePref[]) {
  const KEY = 'surfaces'
  let prefs = store.get<SurfacePref[]>(KEY, defaults)
  const listeners = new Set<() => void>()

  return {
    get(): readonly SurfacePref[] {
      return prefs
    },
    setTheme(surface: string, theme: string): void {
      prefs = prefs.map((p) => (p.id === surface ? { ...p, theme } : p))
      store.set(KEY, prefs)
      for (const listener of listeners) listener()
    },
    onChange(listener: () => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export type ShellPrefs = ReturnType<typeof createShellPrefs>
