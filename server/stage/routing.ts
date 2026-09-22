import type { Content, Route } from '@contract'

// Which surfaces a content may go to. Rules: docs/CONTRACT.md §5, rules 7 and 11.

export interface SurfaceConfig {
  id: string
  /** The user's name for it; content can prefer a window by this name. */
  name?: string
  profile: string
  theme: string
  /** What this surface takes; absent means everything. */
  accepts?: Route
  /** Also takes what no visible surface's route admits. */
  fallback?: boolean
  /** Hidden surfaces get nothing; what they held goes elsewhere. */
  hidden?: boolean
}

/** Does `route` admit `content`? No route admits everything. */
export function admits(route: Route | undefined, content: Content): boolean {
  if (!route) return true
  return (!route.packs || route.packs.includes(content.pack)) && (!route.kinds || route.kinds.includes(content.kind))
}

/**
 * The routing for one scheduling pass, in order of precedence:
 * 1. hidden surfaces take nothing;
 * 2. a content preferring a window (by name) goes only there, while that window
 *    is visible and its route admits it; otherwise the preference is ignored;
 * 3. a surface takes what its route admits;
 * 4. a fallback surface also takes what no visible surface admits.
 */
export function createRouter(surfaces: readonly SurfaceConfig[]) {
  const visible = surfaces.filter((s) => !s.hidden)
  const named = new Map(visible.flatMap((s) => (s.name ? [[s.name, s] as const] : [])))
  const homeless = new Map<string, boolean>()

  const preferred = (c: Content) => {
    const s = c.window ? named.get(c.window) : undefined
    return s && admits(s.accepts, c) ? s : undefined
  }
  const isHomeless = (c: Content) => {
    let v = homeless.get(c.id)
    if (v === undefined) homeless.set(c.id, (v = !visible.some((s) => admits(s.accepts, c))))
    return v
  }

  return (surface: SurfaceConfig, content: Content): boolean => {
    if (surface.hidden) return false
    const pin = preferred(content)
    if (pin) return surface === pin
    return admits(surface.accepts, content) || (!!surface.fallback && isHomeless(content))
  }
}
