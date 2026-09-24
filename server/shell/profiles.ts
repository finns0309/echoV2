// Window profiles: a name for a "mode of consumption" resolved to real bounds.
// Only the shell knows the screen geometry; themes just name a profile.
import type { Bounds } from './prefs'

export interface ResolvedProfile extends Bounds {
  clickThrough: boolean
}

type Resolver = (workArea: Bounds) => ResolvedProfile

const PROFILES: Record<string, Resolver> = {
  // Fullscreen backdrop that stays interactive (流体, 新世纪, 夜潮).
  ambient: (wa) => ({ ...wa, clickThrough: false }),
  // A narrow object hanging from the top-right edge (风铃).
  hanging: (wa) => ({ x: wa.x + wa.width - 330, y: wa.y, width: 300, height: 470, clickThrough: false }),
  // An object standing on the desk, bottom right, with room to unfold to its left (Duo).
  device: (wa) => ({ x: wa.x + wa.width - 790, y: wa.y + wa.height - 590, width: 760, height: 560, clickThrough: false }),
  // The whole screen, clicks passing through: something living on the desktop (もち).
  overlay: (wa) => ({ ...wa, clickThrough: true }),
}

export function resolveProfile(name: string, workArea: Bounds): ResolvedProfile {
  const resolve = PROFILES[name]
  if (!resolve) throw new Error(`unknown window profile: ${name}`)
  return resolve(workArea)
}
