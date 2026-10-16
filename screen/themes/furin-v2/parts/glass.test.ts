import { describe, expect, it } from 'vitest'
import { brush, cubic } from './brush'
import { glassOf, outline } from './glass'

describe('the glass', () => {
  it('takes the season’s colour from Claude’s palette', () => {
    expect(glassOf(new Date('2026-04-10')).name).toBe('heather')
    expect(glassOf(new Date('2026-07-10')).name).toBe('cactus')
    expect(glassOf(new Date('2026-10-16')).name).toBe('manilla')
    expect(glassOf(new Date('2026-01-10')).name).toBe('oat')
  })

  it('is outlined in one closed brush shape', () => {
    const d = outline()
    expect(d.startsWith('M')).toBe(true)
    expect(d.match(/M/g)).toHaveLength(1)
    expect(d.endsWith('Z')).toBe(true)
  })
})

describe('a brush stroke', () => {
  it('is as wide as its pressure says, across the line', () => {
    const d = brush([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }], () => 4)
    const ys = [...d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) => Number(m[2]))
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(4)
  })

  it('samples a curve end to end', () => {
    const pts = cubic({ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 0 }, 4)
    expect(pts).toHaveLength(5)
    expect(pts[0]).toEqual({ x: 0, y: 0 })
    expect(pts[4]).toEqual({ x: 10, y: 0 })
  })
})
