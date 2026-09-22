import { describe, expect, it } from 'vitest'
import { createStage } from './state'

describe('stage state', () => {
  const surfaces = { main: { profile: 'hanging', theme: '', slots: {} } }

  it('starts at rev 0', () => {
    expect(createStage(surfaces).snapshot().rev).toBe(0)
  })

  it('bumps rev and notifies on every update', () => {
    const stage = createStage(surfaces)
    const seen: number[] = []
    stage.subscribe((s) => seen.push(s.rev))
    stage.update(surfaces)
    stage.update(surfaces)
    expect(seen).toEqual([1, 2])
  })

  it('stops notifying after unsubscribe', () => {
    const stage = createStage(surfaces)
    const seen: number[] = []
    const off = stage.subscribe((s) => seen.push(s.rev))
    off()
    stage.update(surfaces)
    expect(seen).toEqual([])
  })
})
