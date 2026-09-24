import { describe, expect, it } from 'vitest'
import { createMochi, hop, type World } from './motion'

const world = (w: Partial<World> = {}): World => ({ width: 1200, talking: false, playing: false, energy: 0, night: false, ...w })
/** A fixed sequence standing in for Math.random. */
const seq = (...xs: number[]) => {
  let i = 0
  return () => xs[i++ % xs.length]!
}
function run(m: ReturnType<typeof createMochi>, seconds: number, w: World) {
  let pose = m.step(0, w)
  for (let s = 0; s < seconds; s += 1 / 60) pose = m.step(1 / 60, w)
  return pose
}

describe('a hop', () => {
  it('crouches, flies, and lands', () => {
    expect(hop(0.05).lift).toBe(0)
    expect(hop(0.05).squash).toBeGreaterThan(0)
    expect(hop(0.5).lift).toBeCloseTo(14)
    expect(hop(0.5).squash).toBeLessThan(0)
    expect(hop(0.95).lift).toBe(0)
  })
})

describe('the mochi', () => {
  it('wanders to a place along the floor and stops there', () => {
    const m = createMochi(600, seq(0.1, 0.1, 0.9, 0.5))
    const seen = new Set<string>()
    let pose = m.step(0, world())
    for (let s = 0; s < 30; s += 1 / 60) {
      pose = m.step(1 / 60, world())
      seen.add(pose.mode)
    }
    expect(seen.has('walk')).toBe(true)
    expect(pose.x).not.toBe(600)
    expect(pose.x).toBeGreaterThanOrEqual(90)
    expect(pose.x).toBeLessThanOrEqual(1110)
  })

  it('stops and faces you to talk', () => {
    const m = createMochi(600, seq(0.1))
    run(m, 5, world())
    const pose = run(m, 1, world({ talking: true }))
    expect(pose.mode).toBe('talk')
    expect(pose.look).toBe(0)
  })

  it('jumps with a "!" for something loud', () => {
    const m = createMochi(600, seq(0.9))
    m.step(0, world())
    m.notice(true)
    let high = 0
    let mark = ''
    for (let s = 0; s < 0.5; s += 1 / 60) {
      const p = m.step(1 / 60, world({ talking: true }))
      high = Math.max(high, p.lift)
      mark = p.mark
    }
    expect(high).toBeGreaterThan(20)
    expect(mark).toBe('!')
  })

  it('sleeps at night with nothing to do, and wakes when something arrives', () => {
    const m = createMochi(600, seq(0.9))
    expect(run(m, 10, world({ night: true })).mode).toBe('sleep')
    m.notice(false)
    expect(run(m, 0.1, world({ night: true, talking: true })).mode).toBe('talk')
  })

  it('dances to what plays', () => {
    const m = createMochi(600, seq(0.9))
    const pose = run(m, 2, world({ playing: true, energy: 0.8 }))
    expect(pose.mode).toBe('dance')
    expect(pose.eyes === 'happy' || pose.eyes === 'blink').toBe(true)
  })
})
