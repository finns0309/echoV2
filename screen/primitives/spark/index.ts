// The spark: a starburst of rays cut as if from paper, narrow at the root,
// broad and square-cut at the tip, a little uneven in length and angle, none
// quite aimed at the middle. The shape only (pure, tested); themes draw it and
// move it their own way.

export interface Ray {
  /** Radians, clockwise from three o'clock. */
  angle: number
  /** Tip distance from the centre, the spark's radius being 1. */
  length: number
  /** Width at the tip. */
  width: number
  /** How far the ray passes beside the centre rather than through it. */
  offset: number
}

const deg = Math.PI / 180

/** Twelve rays, twelve o'clock first: [degrees clockwise, length, sideways]. */
const CUT: readonly (readonly [number, number, number])[] = [
  [-26, 1, 0.012],
  [8, 0.84, -0.01],
  [37, 0.95, 0.008],
  [69, 0.78, -0.014],
  [96, 0.96, 0.006],
  [124, 0.8, 0.012],
  [153, 0.92, -0.008],
  [181, 0.86, 0.01],
  [209, 0.97, -0.012],
  [239, 0.74, 0.008],
  [266, 0.9, -0.006],
  [298, 0.82, 0.014],
]
export const RAYS: readonly Ray[] = CUT.map(([a, length, offset]) => ({ angle: (a - 90) * deg, length, width: 0.19, offset }))

/** A ray's root is this much of its tip's width; the tip's corners are cut back this far. */
const TAPER = 0.34
const CHAMFER = 0.55
/** The knot in the middle that holds the rays. */
const HUB = 0.1
const f = (n: number) => (Math.round(n * 1000) / 1000).toString()

/**
 * One path for the whole spark: each ray a long wedge from the hub to a
 * square tip with its corners cut. `stretch[i]` scales ray i's length (1 = at rest).
 */
export function sparkPath(rays: readonly Ray[] = RAYS, stretch?: readonly number[]): string {
  return rays
    .map((r, i) => {
      const len = Math.max(HUB + r.width, r.length * (stretch?.[i] ?? 1))
      const w1 = r.width / 2
      const w0 = w1 * TAPER
      const cut = w1 * CHAMFER
      const ux = Math.cos(r.angle)
      const uy = Math.sin(r.angle)
      const nx = -uy
      const ny = ux
      const p = (d: number, w: number) => `${f(ux * d + nx * (w + r.offset))} ${f(uy * d + ny * (w + r.offset))}`
      return `M${p(0, w0)}L${p(len - cut, w1)}L${p(len, w1 - cut)}L${p(len, cut - w1)}L${p(len - cut, -w1)}L${p(0, -w0)}Z`
    })
    .join('')
    .concat(`M${HUB} 0A${HUB} ${HUB} 0 1 0 ${-HUB} 0A${HUB} ${HUB} 0 1 0 ${HUB} 0Z`)
}
