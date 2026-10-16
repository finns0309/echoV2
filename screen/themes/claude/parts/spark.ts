// The spark: a starburst of rounded rays, a little uneven, as if cut by hand.
// One lives on the page. It greets, thinks, writes and listens, and how it
// moves says which: `sparkPath` is the shape (pure, tested), `createSpark`
// the creature.

export interface Ray {
  /** Radians, clockwise from three o'clock. */
  angle: number
  /** Tip distance from the centre, the spark's radius being 1. */
  length: number
  /** Width at the tip. */
  width: number
}

const deg = Math.PI / 180

/** Eleven rays, none quite where or as long as an even spacing would put them. Twelve o'clock first. */
const LENGTHS = [1, 0.78, 0.92, 0.7, 0.97, 0.82, 0.74, 0.99, 0.72, 0.9, 0.8]
const NUDGE = [0, 4, -3, 5, -2, 3, -5, 2, -4, 3, -1]
export const RAYS: readonly Ray[] = LENGTHS.map((length, i) => ({
  angle: ((i * 360) / LENGTHS.length + NUDGE[i]! - 90) * deg,
  length,
  width: 0.18,
}))

/** The rays narrow toward the middle, where a hub holds them together. */
const TAPER = 0.6
const HUB = 0.12
const f = (n: number) => (Math.round(n * 1000) / 1000).toString()

/**
 * One path for the whole spark: each ray a stroke from the hub to a round
 * tip. `stretch[i]` scales ray i's length (1 = at rest).
 */
export function sparkPath(rays: readonly Ray[] = RAYS, stretch?: readonly number[]): string {
  return rays
    .map((r, i) => {
      const len = Math.max(HUB + r.width, r.length * (stretch?.[i] ?? 1))
      const w1 = r.width / 2
      const w0 = w1 * TAPER
      const r1 = len - w1
      const ux = Math.cos(r.angle)
      const uy = Math.sin(r.angle)
      const nx = -uy
      const ny = ux
      const p = (d: number, w: number) => `${f(ux * d + nx * w)} ${f(uy * d + ny * w)}`
      return `M${p(0, w0)}L${p(r1, w1)}A${f(w1)} ${f(w1)} 0 0 0 ${p(r1, -w1)}L${p(0, -w0)}Z`
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
