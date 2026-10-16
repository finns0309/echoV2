import { describe, expect, it } from 'vitest'
import { RAYS, sparkPath } from './spark'

const tips = (d: string) => [...d.matchAll(/A[^A]*?0 0 0 (-?[\d.]+) (-?[\d.]+)/g)].map((m) => Math.hypot(Number(m[1]), Number(m[2])))

describe('the spark', () => {
  it('is eleven rays round a hub, none longer than the radius', () => {
    const d = sparkPath()
    expect(d.match(/M/g)).toHaveLength(RAYS.length + 1)
    expect(RAYS).toHaveLength(11)
    for (const r of tips(d)) expect(r).toBeLessThanOrEqual(1)
  })

  it('stretches a ray by its factor, but never into the hub', () => {
    const rest = tips(sparkPath())
    const pulled = tips(sparkPath(RAYS, RAYS.map((_, i) => (i === 0 ? 0.5 : 1))))
    expect(pulled[0]).toBeLessThan(rest[0]!)
    expect(pulled.slice(1)).toEqual(rest.slice(1))
    const gone = tips(sparkPath(RAYS, RAYS.map(() => 0)))
    for (const r of gone) expect(r).toBeGreaterThan(0.12)
  })
})
