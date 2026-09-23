import { describe, expect, it } from 'vitest'
import { clampInto, pushedBack } from './place'

// The two screens from a real session: an external display above the laptop's.
const external = { x: -1666, y: -1050, width: 1920, height: 1050 }
const laptop = { x: 0, y: 33, width: 1470, height: 923 }

describe('window placement', () => {
  it('clamps a window into a work area by the least move', () => {
    expect(clampInto({ x: -857, y: -1050, width: 1920, height: 1050 }, external)).toEqual(external)
    expect(clampInto({ x: 200, y: -1040, width: 300, height: 470 }, external)).toEqual({ x: -46, y: -1040, width: 300, height: 470 })
    expect(clampInto({ x: 10, y: 40, width: 300, height: 470 }, laptop)).toEqual({ x: 10, y: 40, width: 300, height: 470 })
  })

  it("tells macOS pushing a window back on screen from the user's hand", () => {
    // seen in the log: a maximized chime left half off the screen, pushed back on a swipe between Spaces
    expect(pushedBack({ x: -857, y: -1050, width: 1920, height: 1050 }, { x: -1666, y: -1050, width: 1920, height: 1050 }, external)).toBe(true)
    // and a page 32px over the laptop's edge, pushed back when it showed
    expect(pushedBack({ x: 32, y: 33, width: 1470, height: 923 }, { x: 0, y: 33, width: 1470, height: 923 }, laptop)).toBe(true)
    // a drag step, a resize, and no move at all are not
    expect(pushedBack({ x: -857, y: -1050, width: 1920, height: 1050 }, { x: -998, y: -1050, width: 1920, height: 1050 }, external)).toBe(false)
    expect(pushedBack({ x: 32, y: 33, width: 1470, height: 923 }, { x: 0, y: 33, width: 1400, height: 923 }, laptop)).toBe(false)
    expect(pushedBack(laptop, laptop, laptop)).toBe(false)
  })
})
