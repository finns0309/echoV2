// The masthead's words for a moment in time, the way a Japanese paper prints them:
// the date in kanji numerals with the era year, the weekday, the issue number (the
// day of the year), and which edition it is (morning until three, then evening).

const DIGITS = '〇一二三四五六七八九'
const WEEKDAYS = '日月火水木金土'
const REIWA_FROM = 2018 // 令和 1 is 2019

/** 2026 → 二〇二六: years are read digit by digit. */
export const kanjiDigits = (n: number): string => [...String(n)].map((d) => DIGITS[Number(d)]).join('')

/** 23 → 二十三: months and days are read as numbers. */
export function kanjiNumber(n: number): string {
  if (n < 10) return DIGITS[n]!
  const tens = Math.floor(n / 10)
  const ones = n % 10
  return `${tens > 1 ? DIGITS[tens] : ''}十${ones ? DIGITS[ones] : ''}`
}

export interface Edition {
  /** 二〇二六年（令和八年）九月二十三日 */
  date: string
  /** 水曜日 */
  weekday: string
  /** 第266号 */
  issue: string
  /** 朝刊 or 夕刊 */
  edition: string
  /** 08:05 */
  time: string
}

export function editionAt(d: Date): Edition {
  const y = d.getFullYear()
  const dayOfYear = Math.round((new Date(y, d.getMonth(), d.getDate()).getTime() - new Date(y, 0, 1).getTime()) / 86_400_000) + 1
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    date: `${kanjiDigits(y)}年（令和${kanjiNumber(y - REIWA_FROM)}年）${kanjiNumber(d.getMonth() + 1)}月${kanjiNumber(d.getDate())}日`,
    weekday: `${WEEKDAYS[d.getDay()]}曜日`,
    issue: `第${dayOfYear}号`,
    edition: d.getHours() >= 15 ? '夕刊' : '朝刊',
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  }
}
