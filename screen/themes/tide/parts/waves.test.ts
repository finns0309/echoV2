import { describe, expect, it } from 'vitest'
import { ARRIVE_END, scheduleWaves, spokenEnd, type TimedLine } from './waves'

const line = (time: number, spoken: number): TimedLine => ({
  time,
  text: 'x',
  units: [{ time, duration: spoken, text: 'x' }],
})

describe('tide wave schedule', () => {
  it('launches so the front has cleared the text when the next line starts', () => {
    const [first] = scheduleWaves([line(0, 2), line(4, 2)])
    expect(first).toBeCloseTo(4 - ARRIVE_END)
  })

  it('never launches before the last unit has been spoken', () => {
    // spoken right up to the change: the wave waits for the words
    const lines = [line(0, 3.9), line(4, 1)]
    expect(scheduleWaves(lines)[0]!).toBeGreaterThanOrEqual(spokenEnd(lines[0]!) - 0.28)
  })

  it('swaps dense lines without a wave', () => {
    expect(scheduleWaves([line(0, 0.5), line(1, 0.5), line(2, 0.5), line(3, 0.5)]).length).toBeLessThan(3)
  })

  it('sends one last wave after the final line', () => {
    expect(scheduleWaves([line(0, 2)])).toHaveLength(1)
  })
})
