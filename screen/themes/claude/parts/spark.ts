// The spark: a starburst of rays cut as if from paper, narrow at the root,
// broad and square-cut at the tip, a little uneven in length and angle, none
// quite aimed at the middle. One lives on the page. It greets, thinks, writes
// and listens, and how it moves says which: `sparkPath` is the shape (pure,
// tested), `createSpark` the creature.

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

/** Where the spark should be, in client coordinates: its centre and size. */
export interface Spot {
  x: number
  y: number
  size: number
}

export type SparkMood = 'rest' | 'think' | 'listen'

/** How each mood moves the rays: how far they pull in, how fast, how it turns. */
const MOODS: Record<SparkMood, { wobble: number; speed: number; spin: number }> = {
  rest: { wobble: 0.04, speed: 1.2, spin: 0 },
  think: { wobble: 0.3, speed: 6.5, spin: 70 },
  listen: { wobble: 0.1, speed: 2.4, spin: 0 },
}

const SVG = 'http://www.w3.org/2000/svg'

export interface Spark {
  readonly el: SVGSVGElement
  mood(next: SparkMood): void
  /** A beat: a kick, and a part turn. */
  beat(strength: number): void
  /** How loud it is now, 0..1, relative to what has been playing. */
  level(v: number): void
  /** Something worth a glance: it bursts open and spins. */
  flare(): void
  /** Advance by `dt` seconds and redraw. */
  step(dt: number): void
}

export function createSpark(className: string): Spark {
  const el = document.createElementNS(SVG, 'svg')
  el.setAttribute('class', className)
  el.setAttribute('viewBox', '-1.05 -1.05 2.1 2.1')
  el.setAttribute('aria-hidden', 'true')
  const g = document.createElementNS(SVG, 'g')
  const path = document.createElementNS(SVG, 'path')
  path.setAttribute('d', sparkPath())
  g.append(path)
  el.append(g)

  let target: SparkMood = 'rest'
  const cur = { ...MOODS.rest }
  let phase = 0
  let turn = 0
  let turnTo = 0
  let kick = 0
  let burst = 0
  let loud = 0
  const stretch = RAYS.map(() => 1)

  return {
    el,
    mood(next) {
      target = next
    },
    beat(strength) {
      kick = Math.min(1, Math.max(kick, strength))
      turnTo += 15 * Math.min(1, 0.4 + strength)
    },
    level(v) {
      loud = Math.max(0, Math.min(1, v))
    },
    flare() {
      burst = 1
      turnTo += 90
    },
    step(dt) {
      const m = MOODS[target]
      const ease = 1 - Math.exp(-dt * 5)
      cur.wobble += (m.wobble - cur.wobble) * ease
      cur.speed += (m.speed - cur.speed) * ease
      cur.spin += (m.spin - cur.spin) * ease
      phase += dt * cur.speed
      turnTo += cur.spin * dt
      turn += (turnTo - turn) * (1 - Math.exp(-dt * 9))
      kick *= Math.exp(-dt * 6)
      burst *= Math.exp(-dt * 3.2)
      const swell = target === 'listen' ? loud * 0.16 : 0
      for (let i = 0; i < stretch.length; i++) {
        // Neighbouring rays out of step, so it ripples round rather than pulsing as one.
        const pull = cur.wobble * (0.5 + 0.5 * Math.sin(phase + i * 2.1))
        stretch[i] = 1 - pull + swell + kick * 0.22 * (i % 2 ? 0.7 : 1) + burst * 0.18
      }
      path.setAttribute('d', sparkPath(RAYS, stretch))
      const scale = 1 + kick * 0.1 + burst * 0.35
      g.setAttribute('transform', `rotate(${f(turn % 360)}) scale(${f(scale)})`)
    },
  }
}
