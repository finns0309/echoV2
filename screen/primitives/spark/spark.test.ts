import { describe, expect, it } from 'vitest'
import { RAYS, sparkPath } from '.'

/** Each ray's farthest point from the centre. */
const reach = (d: string) =>
  d
    .split('M')
    .filter(Boolean)
    .slice(0, -1)
    .map((ray) => Math.max(...[...ray.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => Math.hypot(Number(m[1]), Number(m[2])))))

describe('the spark', () => {
  it('is twelve rays round a hub, none reaching past the radius', () => {
    const d = sparkPath()
    expect(RAYS).toHaveLength(12)
    expect(d.match(/M/g)).toHaveLength(RAYS.length + 1)
    for (const r of reach(d)) expect(r).toBeLessThanOrEqual(1.01)
  })

  it('stretches a ray by its factor, but never into the hub', () => {
    const rest = reach(sparkPath())
    const pulled = reach(sparkPath(RAYS, RAYS.map((_, i) => (i === 0 ? 0.5 : 1))))
    expect(pulled[0]).toBeLessThan(rest[0]!)
    expect(pulled.slice(1)).toEqual(rest.slice(1))
    for (const r of reach(sparkPath(RAYS, RAYS.map(() => 0)))) expect(r).toBeGreaterThan(0.1)
  })
})
