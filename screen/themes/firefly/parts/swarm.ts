// The swarm. Each firefly flies on its own: a heading that wanders, a pull toward
// the swarm's drifting centre, a push away from close neighbours. Each flashes on
// its own clock. Called to a point, it flies there after a moment and holds a
// steady glow, to help spell something; released, it goes back to wandering, and
// the ones that came in only to help fly off the screen.
//
// Beats bring them into step, as synchronous fireflies (Pteroptyx) come into step
// with one another: the swarm keeps a chorus every few beats, and on each beat a
// few more join it, flashing on the chorus rather than on their own clocks, until
// the whole swarm flashes as one. When the beats stop, they drift apart again.
//
// Pure: no DOM, a random source passed in, so it is tested.

export interface Target {
  x: number
  y: number
  /** How bright it holds, 0–1. */
  lum: number
  /** How far apart the points of this formation are, px; its glow keeps to that. */
  dot?: number
  /** The colour it glows while it holds here, if not its own. */
  tint?: readonly [number, number, number]
}

export interface Fly {
  x: number
  y: number
  vx: number
  vy: number
  heading: number
  /** Where it is in its flash cycle, 0–1; it flashes as this wraps. */
  phase: number
  /** Flashes a second, on its own. */
  rate: number
  /** It has joined the chorus: it flashes on the swarm's beat, not its own. */
  chorus: boolean
  /** How bright it is now, 0–1 (the renderer's input). */
  glow: number
  /** Fading in as it arrives, out as it leaves, 0–1. */
  alpha: number
  target: Target | null
  /** Seconds before it sets off for its target. */
  wait: number
  /** It came in to help spell, and leaves when it's done. */
  extra: boolean
  leaving: boolean
  seed: number
}

export interface World {
  width: number
  height: number
  night: boolean
  /** 0–1, how loud what plays is right now. */
  energy: number
  /** Something is on (a card or something playing). */
  busy: boolean
}

export const BASE = 70 // the swarm, when nobody else is called in
const CRUISE = 36 // px/s wandering
const TURN = 1.6 // how far a heading drifts, radians a second
const PULL = 0.9 // toward the swarm's centre
const APART = 22 // px: closer than this, they push apart
const SPRING = 12 // toward a target
const DAMP = 6.5
const REACH = 900 // px/s, the fastest one flies in
const CHORUS = 4 // beats between the swarm's flashes
const JOIN = 0.28 // of those not yet in step, how many join on a strong beat
const APART_S = 3 // no beat for this long, and they go back to their own clocks
const FLASH = 0.14 // of the cycle, the flash itself
const EMBER = 0.07 // the glow between flashes
const IDLE_S = 150 // nothing on for this long, by day, and they settle in the grass
const GRASS = 46 // px: the band along the bottom they settle in

export function createSwarm(width: number, height: number, random: () => number = Math.random) {
  const flies: Fly[] = []
  const spawn = (x: number, y: number, extra: boolean): Fly => ({
    x,
    y,
    vx: 0,
    vy: 0,
    heading: random() * Math.PI * 2,
    phase: random(),
    rate: 0.32 + random() * 0.22,
    chorus: false,
    glow: 0,
    alpha: extra ? 0 : 1,
    target: null,
    wait: 0,
    extra,
    leaving: false,
    seed: random() * 100,
  })
  for (let i = 0; i < BASE; i++) flies.push(spawn(width * (0.25 + random() * 0.5), height * (0.3 + random() * 0.4), false))

  // The swarm's centre drifts about on its own.
  const centre = { x: width / 2, y: height * 0.45, heading: random() * Math.PI * 2 }
  let idle = 0
  let t = 0
  let spelling = false
  let resting = false
  let beats = 0
  let lastBeat = -Infinity

  /** A point just off the nearest edge. */
  function edge(w: number, h: number): [number, number] {
    const side = Math.floor(random() * 4)
    const along = random()
    if (side === 0) return [-20, along * h]
    if (side === 1) return [w + 20, along * h]
    if (side === 2) return [along * w, h + 20]
    return [along * w, -20]
  }

  return {
    flies,

    /**
     * Spell something: send a firefly to each target, nearest first, calling more
     * in from the edges if the swarm is too small. `hurry` gathers them at once.
     */
    form(targets: readonly Target[], w: number, h: number, hurry = false): void {
      spelling = targets.length > 0
      idle = 0
      for (const f of flies) f.target = null
      let free = flies.filter((f) => !f.leaving)
      for (let i = free.length; i < targets.length; i++) {
        const [x, y] = edge(w, h)
        const f = spawn(x, y, true)
        flies.push(f)
        free.push(f)
      }
      // Greedy, nearest pair first, by taking the targets in order of distance from
      // the swarm's centre and giving each the nearest firefly still free.
      const cx = targets.reduce((s, p) => s + p.x, 0) / (targets.length || 1)
      const cy = targets.reduce((s, p) => s + p.y, 0) / (targets.length || 1)
      const order = [...targets].sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy))
      for (const p of order) {
        let best = 0
        let bestD = Infinity
        for (let i = 0; i < free.length; i++) {
          const f = free[i]!
          const d = (f.x - p.x) ** 2 + (f.y - p.y) ** 2
          if (d < bestD) {
            bestD = d
            best = i
          }
        }
        const f = free[best]!
        f.target = p
        f.wait = hurry ? random() * 0.25 : random() * 1.1
        free[best] = free[free.length - 1]!
        free.pop()
      }
      if (targets.length) {
        centre.x = cx
        centre.y = cy
      }
      // The ones left over stay about, and the extras not needed go.
      free = free.filter((f) => f.extra)
      for (const f of free) f.leaving = true
      if (hurry) for (const f of flies) f.glow = 1
    },

    /** Let go of whatever they spell. */
    release(): void {
      spelling = false
      for (const f of flies) {
        f.target = null
        if (f.extra) f.leaving = true
      }
    },

    /** A beat: a few more join the chorus, and every few beats the chorus flashes. */
    beat(strength: number): void {
      lastBeat = t
      const chorus = ++beats % CHORUS === 0
      for (const f of flies) {
        if (f.target) f.glow = Math.min(1, f.glow + 0.35 * strength)
        else if (!f.chorus && random() < JOIN * Math.min(1, strength)) f.chorus = true
        if (f.chorus && chorus) f.phase = 0
      }
    },

    step(dt: number, world: World): void {
      t += dt
      idle = world.busy || spelling ? 0 : idle + dt
      resting = idle > IDLE_S && !world.night
      const pace = CRUISE * (world.night ? 1.25 : 1) * (1 + world.energy * 0.8)

      // The centre wanders within the screen's middle.
      centre.heading += (random() - 0.5) * TURN * dt * 2
      if (!spelling) {
        centre.x += Math.cos(centre.heading) * pace * 0.35 * dt
        centre.y += Math.sin(centre.heading) * pace * 0.25 * dt
      }
      const mx = world.width * 0.12
      const my = world.height * 0.15
      if (centre.x < mx || centre.x > world.width - mx) centre.heading = Math.PI - centre.heading
      if (centre.y < my || centre.y > world.height - my) centre.heading = -centre.heading
      centre.x = Math.min(world.width - mx, Math.max(mx, centre.x))
      centre.y = Math.min(world.height - my, Math.max(my, centre.y))

      for (let i = flies.length - 1; i >= 0; i--) {
        const f = flies[i]!
        f.wait = Math.max(0, f.wait - dt)
        const bound = f.target && f.wait === 0

        if (bound) {
          // To the target, with a little hover so the letters shimmer.
          const p = f.target!
          const tx = p.x + Math.sin(t * 1.7 + f.seed) * 1.1
          const ty = p.y + Math.cos(t * 1.3 + f.seed) * 1.1
          f.vx += ((tx - f.x) * SPRING - f.vx * DAMP) * dt
          f.vy += ((ty - f.y) * SPRING - f.vy * DAMP) * dt
          const v = Math.hypot(f.vx, f.vy)
          if (v > REACH) {
            f.vx *= REACH / v
            f.vy *= REACH / v
          }
          // Steady, with a slow flicker; beats add to it and it settles back.
          const hold = p.lum * (0.84 + 0.16 * Math.sin(t * 2.3 + f.seed))
          f.glow += (hold - f.glow) * Math.min(1, dt * 3)
        } else {
          // Wandering: the heading drifts, pulled home, pushed apart.
          f.heading += (random() - 0.5) * TURN * dt * 2
          let ax = Math.cos(f.heading) * pace
          let ay = Math.sin(f.heading) * pace * 0.8
          if (f.leaving) {
            // Out by the nearest side.
            const out = Math.min(f.x, world.width - f.x) < Math.min(f.y, world.height - f.y) ? (f.x < world.width / 2 ? [-1, 0] : [1, 0]) : f.y < world.height / 2 ? [0, -1] : [0, 1]
            ax += out[0]! * pace * 3
            ay += out[1]! * pace * 3
            f.alpha = Math.max(0, f.alpha - dt * 0.5)
          } else if (resting) {
            // Down into the grass, where each keeps its own spot.
            const gx = ((f.seed * 97) % 1) * world.width
            const gy = world.height - 6 - ((f.seed * 13) % 1) * GRASS
            ax = (gx - f.x) * 0.6
            ay = (gy - f.y) * 0.6
          } else {
            ax += (centre.x - f.x) * PULL * 0.08 * (1 + Math.abs(centre.x - f.x) / world.width)
            ay += (centre.y - f.y) * PULL * 0.08 * (1 + Math.abs(centre.y - f.y) / world.height)
            for (let j = 0; j < flies.length; j++) {
              if (j === i) continue
              const o = flies[j]!
              if (o.target) continue
              const dx = f.x - o.x
              const dy = f.y - o.y
              const d = Math.hypot(dx, dy)
              if (d > 0 && d < APART) {
                ax += (dx / d) * (APART - d) * 3
                ay += (dy / d) * (APART - d) * 3
              }
            }
          }
          const ease = Math.min(1, dt * 1.8)
          f.vx += (ax - f.vx) * ease
          f.vy += (ay - f.vy) * ease
          // Its own flash: short, then dark but for an ember. Slower when resting.
          // Its own clock, or, in the chorus, waiting for the chorus to flash.
          if (f.chorus && t - lastBeat > APART_S) f.chorus = false
          f.phase += f.rate * dt * (resting ? 0.45 : 1)
          if (f.phase >= 1) f.phase = f.chorus ? 0.999 : f.phase - 1
          const flash = f.phase < FLASH ? Math.sin((f.phase / FLASH) * Math.PI) : 0
          const want = resting ? EMBER + flash * 0.45 : EMBER + flash
          f.glow += (want - f.glow) * Math.min(1, dt * 14)
        }
        f.x += f.vx * dt
        f.y += f.vy * dt
        if (!f.leaving && f.alpha < 1) f.alpha = Math.min(1, f.alpha + dt * 1.5)

        const gone = f.leaving && (f.alpha === 0 || f.x < -40 || f.y < -40 || f.x > world.width + 40 || f.y > world.height + 40)
        if (gone) flies.splice(i, 1)
      }
    },

    /** Where the swarm is gathered. */
    get centre(): { x: number; y: number } {
      return { x: centre.x, y: centre.y }
    },

    /** Whether they have settled in the grass. */
    get resting(): boolean {
      return resting
    },
  }
}
