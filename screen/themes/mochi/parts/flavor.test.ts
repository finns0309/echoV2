import { describe, expect, it } from 'vitest'
import { flavorFor, seasonOf } from './flavor'

const on = (m: number, d: number) => flavorFor(new Date(2026, m - 1, d)).id

describe("the season's flavour", () => {
  it('follows the wagashi calendar', () => {
    expect(on(1, 2)).toBe('shiro')
    expect(on(3, 3)).toBe('sakura')
    expect(on(4, 20)).toBe('kusa')
    expect(on(8, 1)).toBe('mizu')
    expect(on(9, 10)).toBe('tsukimi')
    expect(on(10, 20)).toBe('kinako')
    expect(on(11, 20)).toBe('kuri')
    expect(on(12, 24)).toBe('ichigo')
  })

  it('keeps its festival days: kashiwa on Children’s Day, ohagi at the equinox', () => {
    expect(on(5, 5)).toBe('kashiwa')
    expect(on(9, 23)).toBe('ohagi')
    expect(on(9, 28)).toBe('kinako')
  })

  it('has a flavour for every day of a leap year, with no gaps in the calendar', () => {
    for (let day = 0; day < 366; day++) expect(seasonOf(new Date(2028, 0, 1 + day))).toBeDefined()
  })
})
