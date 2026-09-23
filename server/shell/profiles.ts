// Window profiles: a name for a "mode of consumption" resolved to real bounds.
// Only the shell knows the screen geometry; themes just name a profile.
import type { Bounds } from './prefs'

export interface ResolvedProfile extends Bounds {
  clickThrough: boolean
  /** Whether the user may resize it. A hand-tuned object isn't: its size is the theme's, and macOS won't fill or tile it. */
  resizable: boolean
}

type Resolver = (workArea: Bounds) => ResolvedProfile

const PROFILES: Record<string, Resolver> = {
  // Fullscreen backdrop that stays interactive (流体, 新世纪, 夜潮).
  ambient: (wa) => ({ ...wa, clickThrough: false, resizable: true }),
  // A narrow object hanging from the top-right edge (风铃).
  hanging: (wa) => ({ x: wa.x + wa.width - 330, y: wa.y, width: 300, height: 470, clickThrough: false, resizable: false }),
}

export function resolveProfile(name: string, workArea: Bounds): ResolvedProfile {
  const resolve = PROFILES[name]
  if (!resolve) throw new Error(`unknown window profile: ${name}`)
  return resolve(workArea)
}
