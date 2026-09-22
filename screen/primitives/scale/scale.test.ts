import { describe, expect, it } from 'vitest'
import { scaleFor } from './index'

describe('scaleFor', () => {
  it('stays 1 for the hand-tuned window and casual resizes', () => {
    expect(scaleFor(300, 470)).toBe(1)
    expect(scaleFor(600, 600)).toBe(1)
  })

  it('grows gently with a filled screen and caps on huge displays', () => {
    const laptop = scaleFor(1470, 923)
    expect(laptop).toBeGreaterThan(1.4)
    expect(laptop).toBeLessThan(1.8)
    expect(scaleFor(2045, 1050)).toBeGreaterThan(laptop)
    expect(scaleFor(10000, 10000)).toBe(3.2)
  })
})
