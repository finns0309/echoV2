import { describe, expect, it } from 'vitest'
import { BASE, createSwarm, type Target, type World } from './swarm'

/** A repeatable random source. */
function seeded(seed = 1) {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}
const W = 1200
const H = 800
const world = (extra: Partial<World> = {}): World => ({ width: W, height: H, night: false, energy: 0, busy: true, ...extra })
const run = (swarm: ReturnType<typeof createSwarm>, seconds: number, w: World = world()) => {
  for (let t = 0; t < seconds; t += 1 / 60) swarm.step(1 / 60, w)
}
const grid = (n: number): Target[] => Array.from({ length: n }, (_, i) => ({ x: 300 + (i % 40) * 12, y: 300 + Math.floor(i / 40) * 12, lum: 1 }))

describe('the swarm', () => {
  it('sends one firefly to each point, calling more in when it is too small', () => {
    const swarm = createSwarm(W, H, seeded())
    const targets = grid(200)
    swarm.form(targets, W, H)
    expect(swarm.flies.length).toBe(200)
    const held = swarm.flies.map((f) => f.target).filter(Boolean)
    expect(new Set(held).size).toBe(200)
  })

  it('gathers them onto the points, and holds them lit', () => {
    const swarm = createSwarm(W, H, seeded(2))
    const targets = grid(120)
    swarm.form(targets, W, H)
    run(swarm, 4)
    for (const f of swarm.flies) {
      const p = f.target!
      expect(Math.hypot(f.x - p.x, f.y - p.y)).toBeLessThan(4)
      expect(f.glow).toBeGreaterThan(0.6)
    }
  })

  it('lets the ones called in leave when released, back to the swarm it had', () => {
    const swarm = createSwarm(W, H, seeded(3))
    swarm.form(grid(300), W, H)
    run(swarm, 3)
    swarm.release()
    run(swarm, 6, world({ busy: false }))
    expect(swarm.flies.length).toBe(BASE)
    expect(swarm.flies.every((f) => !f.target && !f.extra)).toBe(true)
  })

  it('comes to flash together on the beats, and drifts apart when they stop', () => {
    const swarm = createSwarm(W, H, seeded(4))
    // Of the swarm, how many are flashing right now.
    const lit = () => swarm.flies.filter((f) => f.phase < 0.05).length / swarm.flies.length
    let first = 0
    for (let i = 1; i <= 40; i++) {
      run(swarm, 0.5)
      swarm.beat(0.8)
      if (i === 4) first = lit() // the first chorus: only a few have joined
    }
    expect(first).toBeLessThan(0.7)
    expect(lit()).toBeGreaterThan(0.95) // the tenth chorus: all but none
    run(swarm, 10)
    expect(swarm.flies.every((f) => !f.chorus)).toBe(true)
  })

  it('settles in the grass after a long while with nothing on, by day only', () => {
    const day = createSwarm(W, H, seeded(5))
    run(day, 160, world({ busy: false }))
    expect(day.resting).toBe(true)
    run(day, 20, world({ busy: false }))
    expect(day.flies.every((f) => f.y > H - 60)).toBe(true)

    const night = createSwarm(W, H, seeded(5))
    run(night, 160, world({ busy: false, night: true }))
    expect(night.resting).toBe(false)
  })

  it('keeps a frame cheap with a full formation', () => {
    const swarm = createSwarm(W, H, seeded(6))
    swarm.form(grid(760), W, H)
    const t0 = performance.now()
    run(swarm, 1)
    expect((performance.now() - t0) / 60).toBeLessThan(4) // ms a frame
  })
})
