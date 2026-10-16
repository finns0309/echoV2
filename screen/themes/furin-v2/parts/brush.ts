// Ink, as Anthropic's illustrations draw it: one confident brush stroke whose
// width follows the hand's pressure, thin where the brush lands and lifts,
// round at both ends. A stroke is a filled outline around a centre line, so it
// can swell and taper as a pen line can't. Pure.

export interface Pt {
  x: number
  y: number
}

/** Points along a cubic Bézier, `n` steps, including both ends. */
export function cubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, n = 16): Pt[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n
    const u = 1 - t
    const a = u * u * u
    const b = 3 * u * u * t
    const c = 3 * u * t * t
    const d = t * t * t
    return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y }
  })
}

/** Joined runs of points, dropping the repeated point where one run starts at the last one's end. */
export function chain(...runs: Pt[][]): Pt[] {
  return runs.flatMap((run, i) => (i ? run.slice(1) : run))
}

/** The usual hand: lands light, presses through the middle, lifts light. */
export const pressure = (t: number) => Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, t))), 0.55)

const f = (n: number) => (Math.round(n * 100) / 100).toString()

/**
 * A brush stroke along `pts` as an SVG path to fill: `width(t)` is its width at
 * `t` (0 at the start, 1 at the end, by length along the line).
 */
export function brush(pts: readonly Pt[], width: (t: number) => number): string {
  if (pts.length < 2) return ''
  const lens = [0]
  for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y))
  const total = lens.at(-1) || 1
  const left: Pt[] = []
  const right: Pt[] = []
  pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 1)]!
    const b = pts[Math.min(pts.length - 1, i + 1)]!
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy) || 1
    const half = Math.max(0.05, width(lens[i]! / total)) / 2
    const nx = (-dy / len) * half
    const ny = (dx / len) * half
    left.push({ x: p.x + nx, y: p.y + ny })
    right.push({ x: p.x - nx, y: p.y - ny })
  })
  const end = Math.max(0.05, width(1)) / 2
  const start = Math.max(0.05, width(0)) / 2
  const line = (q: Pt[]) => q.map((p) => `L${f(p.x)} ${f(p.y)}`).join('')
  const back = [...right].reverse()
  return (
    `M${f(left[0]!.x)} ${f(left[0]!.y)}` +
    line(left.slice(1)) +
    `A${f(end)} ${f(end)} 0 0 1 ${f(back[0]!.x)} ${f(back[0]!.y)}` +
    line(back.slice(1)) +
    `A${f(start)} ${f(start)} 0 0 1 ${f(left[0]!.x)} ${f(left[0]!.y)}Z`
  )
}
