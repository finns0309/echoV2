import { describe, expect, it } from 'vitest'
import { spot } from './bubble'

// A mochi at x = 400, its head 90px up; a bubble 300 wide; a sheet to its right.
const sheet = { left: 460, right: 700, top: 120 }

describe('where a bubble goes', () => {
  it('sits centred over its head with nothing in the way', () => {
    expect(spot(400, 300, 90, 1200)).toEqual({ left: 250, rise: 90 })
  })

  it('slides to the far side of a sheet beside it, the tail still reaching the mochi', () => {
    expect(spot(400, 300, 90, 1200, sheet)).toEqual({ left: 150, rise: 90 })
  })

  it('rises above the sheet when there is no room on the far side', () => {
    expect(spot(60, 300, 90, 1200, { left: 120, right: 360, top: 120 })).toEqual({ left: -90, rise: 140 })
  })

  it('stays put when the sheet is lower than the bubble anyway', () => {
    expect(spot(400, 300, 200, 1200, sheet)).toEqual({ left: 250, rise: 200 })
  })
})
