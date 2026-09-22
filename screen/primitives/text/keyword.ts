// The emphasis window of a line: the block's own emphasis first (a pack or the
// director chose a real word), otherwise a heuristic that picks something that
// reads as a word. Ported from echo's textpick.js pickKeyword.
import { hash, isHan, segment, tokenize } from './segment'

const PARTICLES = '的了是在和把吧呢啊呀哦嘛吗也就都还才又有个不与及或而被着过得地之于'
// Real words, but never what a line is about.
const DULL = new Set(
  '我的 你的 他的 她的 我们 你们 他们 自己 就像 好像 这样 那样 这个 那个 一个 一种 什么 怎么 没有 不是 就是 还是 只是 可是 但是 因为 所以 如果 已经 时候 知道 觉得 可以 不会 不要 一样 这么 那么'.split(' '),
)

export interface Span {
  /** Codepoint index. */
  start: number
  /** Codepoint length. */
  len: number
}

export function pickKeyword(text: string, emphasis?: string): Span {
  if (emphasis) {
    const u16 = text.indexOf(emphasis)
    if (u16 >= 0) return { start: [...text.slice(0, u16)].length, len: [...emphasis].length }
  }
  const chars = [...text]
  const h = hash(text)
  // Latin: a whole word, preferring the meatier ones.
  const words = tokenize(text).filter((t) => t.type === 'word' && [...t.text].length >= 3)
  if (words.length) {
    const w = words[h % words.length]!
    return { start: w.start, len: [...w.text].length }
  }
  // CJK: a real 2–4 character word, not made of particles; the longest wins.
  const segs = segment(text).filter(
    (g) =>
      g.word &&
      g.len >= 2 &&
      g.len <= 4 &&
      [...g.text].every((c) => isHan(c) || /[\u3040-\u30ff]/.test(c)) &&
      ![...g.text].every((c) => PARTICLES.includes(c) || /[\u3040-\u309f]/.test(c)) &&
      !DULL.has(g.text),
  )
  if (segs.length) {
    const top = Math.max(...segs.map((g) => g.len))
    const best = segs.filter((g) => g.len === top)
    const g = best[h % best.length]!
    return { start: g.start, len: g.len }
  }
  // No segmenter or no word: a 2-character window with no particle on either side.
  const cands: number[] = []
  for (let i = 0; i < chars.length - 1; i++) {
    const a = chars[i]!
    const b = chars[i + 1]!
    if (isHan(a) && isHan(b) && !PARTICLES.includes(a) && !PARTICLES.includes(b)) cands.push(i)
  }
  if (cands.length) return { start: cands[h % cands.length]!, len: 2 }
  for (let i = 0; i < chars.length; i++) {
    if (isHan(chars[i]!) && !PARTICLES.includes(chars[i]!)) return { start: i, len: 1 }
  }
  return { start: 0, len: Math.min(2, chars.length) }
}
