// Window profiles: a name for a "mode of consumption" resolved to real bounds.
// Only the shell knows the screen geometry; themes just name a profile.

export interface Area {
  x: number
  y: number
  width: number
  height: number
}

export interface ResolvedProfile extends Area {
  clickThrough: boolean
}

type Resolver = (workArea: Area) => ResolvedProfile

const PROFILES: Record<string, Resolver> = {
  // Fullscreen backdrop that stays interactive (流体, 新世纪, 夜潮).
  ambient: (wa) => ({ ...wa, clickThrough: false }),
  // A narrow object hanging from the top-right edge (风铃).
  hanging: (wa) => ({ x: wa.x + wa.width - 330, y: wa.y, width: 300, height: 470, clickThrough: false }),
}

export function resolveProfile(name: string, workArea: Area): ResolvedProfile {
  const resolve = PROFILES[name]
  if (!resolve) throw new Error(`unknown window profile: ${name}`)
  return resolve(workArea)
}
