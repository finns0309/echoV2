// The spark on the page: one creature that greets, thinks, writes and listens,
// and how it moves says which. The shape is screen/primitives/spark.
import { RAYS, sparkPath } from '@screen/primitives/spark'

const f = (n: number) => (Math.round(n * 1000) / 1000).toString()

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
