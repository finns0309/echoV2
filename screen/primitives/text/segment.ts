// Word-level segmentation for mixed CJK / latin text. Ported from echo's
// textpick.js: breaking by character count cut 「重合」 in half, and a blind
// 2-char window produced non-words like 「刻安」. These are the legal break
// and emphasis boundaries.

export interface Segment {
  text: string
  /** Codepoint index into [...text]. */
  start: number
  /** Length in codepoints. */
  len: number
  /** Word-like (not a space or punctuation run). */
  word: boolean
}

export interface Token {
  type: 'word' | 'char' | 'space'
  text: string
  start: number
}

export const isHan = (c: string) => /\p{Script=Han}/u.test(c)
export const isKana = (c: string) => /[\u3040-\u30ff]/.test(c)
export const isLatin = (c: string) => /[A-Za-z0-9''-]/.test(c)

/** Stable per-text hash, so repeated text always gets the same heuristic pick. */
export function hash(s: string): number {
  let h = 5381
  for (const c of s) h = ((h << 5) + h + c.codePointAt(0)!) >>> 0
  return h
}

/** Latin runs stay whole; every other codepoint is its own token. */
export function tokenize(text: string): Token[] {
  const toks: Token[] = []
  let buf = ''
  let bs = 0
  const flush = () => {
    if (buf) toks.push({ type: 'word', text: buf, start: bs })
    buf = ''
  }
  ;[...text].forEach((ch, i) => {
    if (/\s/.test(ch)) {
      flush()
      toks.push({ type: 'space', text: ch, start: i })
    } else if (isLatin(ch)) {
      if (!buf) bs = i
      buf += ch
    } else {
      flush()
      toks.push({ type: 'char', text: ch, start: i })
    }
  })
  flush()
  return toks
}

const segmenters = new Map<string, Intl.Segmenter | null>()
function segmenterFor(text: string): Intl.Segmenter | null {
  const locale = /[\u3040-\u30ff]/.test(text) ? 'ja' : 'zh'
  if (!segmenters.has(locale)) {
    let s: Intl.Segmenter | null
    try {
      s = new Intl.Segmenter(locale, { granularity: 'word' })
    } catch {
      s = null
    }
    segmenters.set(locale, s)
  }
  return segmenters.get(locale) ?? null
}

export function segment(text: string): Segment[] {
  const sg = segmenterFor(text)
  if (!sg) {
    return tokenize(text).map((t) => ({ text: t.text, start: t.start, len: [...t.text].length, word: t.type !== 'space' }))
  }
  const out: Segment[] = []
  let cp = 0
  for (const s of sg.segment(text)) {
    const len = [...s.segment].length
    out.push({ text: s.segment, start: cp, len, word: !!s.isWordLike })
    cp += len
  }
  // The segmenter splits "A.T." / "don't" on punctuation: glue adjacent latin
  // runs back into one unbreakable unit.
  const latinish = (x: string) => /^[A-Za-z0-9'’.-]+$/.test(x)
  const glued: Segment[] = []
  for (const s of out) {
    const prev = glued[glued.length - 1]
    if (prev && latinish(prev.text) && latinish(s.text)) {
      prev.text += s.text
      prev.len += s.len
      prev.word = true
    } else glued.push({ ...s })
  }
  return glued
}

export function latinRatio(text: string): number {
  const chars = [...text]
  return chars.length ? chars.filter(isLatin).length / chars.length : 0
}
