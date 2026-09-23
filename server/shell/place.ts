// Window geometry the shell reasons about, kept apart from Electron so it can be tested.
import type { Bounds } from './prefs'

export const same = (a: Bounds, b: Bounds) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height

/** `b` moved the least it takes to lie inside `area` (flush with its top-left edge if it can't fit). */
export function clampInto(b: Bounds, area: Bounds): Bounds {
  return {
    ...b,
    x: Math.max(area.x, Math.min(b.x, area.x + area.width - b.width)),
    y: Math.max(area.y, Math.min(b.y, area.y + area.height - b.height)),
  }
}

/**
 * Whether going from `from` to `to` is macOS pushing a window that hung off the screen
 * back onto it: the same size, moved exactly as far as it takes to lie inside the
 * screen's work area. It does this whenever it puts the window back up (showing it,
 * a change of desktops, a swipe between Spaces). A hand on the window moves it in many
 * small steps, which don't land on that one position.
 */
export function pushedBack(from: Bounds, to: Bounds, area: Bounds): boolean {
  if (same(from, to) || from.width !== to.width || from.height !== to.height) return false
  return same(clampInto(from, area), to)
}
