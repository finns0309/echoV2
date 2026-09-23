import { describe, expect, it } from 'vitest'
import { editionAt, kanjiDigits, kanjiNumber } from './masthead'

describe('masthead', () => {
  it('writes years digit by digit and days as numbers', () => {
    expect(kanjiDigits(2026)).toBe('二〇二六')
    expect([1, 10, 12, 20, 23, 31].map(kanjiNumber)).toEqual(['一', '十', '十二', '二十', '二十三', '三十一'])
  })

  it('dates the paper, numbers the issue by the day of the year, and turns evening at three', () => {
    const morning = editionAt(new Date(2026, 8, 23, 8, 5))
    expect(morning).toEqual({ date: '二〇二六年（令和八年）九月二十三日', weekday: '水曜日', issue: '第266号', edition: '朝刊', time: '08:05' })
    expect(editionAt(new Date(2026, 8, 23, 15, 0)).edition).toBe('夕刊')
    expect(editionAt(new Date(2026, 0, 1)).issue).toBe('第1号')
  })
})
