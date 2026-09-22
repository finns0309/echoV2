// LRC / YRC parsing into one neutral line model. Ported from echo's lrc.js.

export interface LyricLine {
  /** Seconds from the start of the track. */
  time: number
  /** Seconds; known from verbatim timing only. */
  duration?: number
  text: string
  /** Verbatim per-unit timing, absolute seconds. */
  units?: { time: number; duration: number; text: string }[]
}

// NetEase prepends crew credits ("[00:00.000] 作词 : XXX", ...). They fill the
// first ~10s of a track and are not lyrics; without filtering, the display
// ticks through credits during the intro.
const CREDIT_RE =
  /^(作词|作曲|编曲|制作人?|和声(编写)?|吉他|贝斯|鼓|键盘|弦乐|录音(工程|助理)?|混音(工程师?)?|母带|监制|出品|发行|策划|配唱|改编|演唱|主唱|合声|和音|MV|Lyrics?|Composed?\s+by|Arranged?\s+by|Produced?\s+by|Mixed?\s+by|Mastered?\s+by|作詞|編曲|歌唱|歌|唄|演奏|Vocals?|Illust(ration)?|Movie|動画|絵)(\s*[/／・]\s*(作词|作曲|编曲|作詞|編曲|歌唱|歌|唄))*\s*[:：]/i

/** Standard LRC → sorted lines. Accepts `[mm:ss.fff]`, `[mm:ss:fff]` and `[mm:ss]`. */
export function parseLRC(lrc: string): LyricLine[] {
  if (!lrc) return []
  const tagRe = /\[(\d+):(\d+)(?:[.:](\d+))?\]/g
  const out: LyricLine[] = []
  for (const raw of lrc.split('\n')) {
    const text = raw.replace(tagRe, '').trim()
    if (!text || CREDIT_RE.test(text)) continue
    for (const m of raw.matchAll(tagRe)) {
      const frac = m[3] ? parseInt(m[3], 10) / Math.pow(10, m[3].length) : 0
      out.push({ time: parseInt(m[1]!, 10) * 60 + parseInt(m[2]!, 10) + frac, text })
    }
  }
  return out.sort((a, b) => a.time - b.time)
}

/**
 * NetEase verbatim format: `[lineStartMs,lineDurMs](tokStartMs,tokDurMs,0)tok…`.
 * Times are absolute. JSON metadata lines don't match the numeric header and are skipped.
 */
export function parseYRC(yrc: string): LyricLine[] {
  if (!yrc) return []
  const lineRe = /\[(\d+),(\d+)\]((?:\(\d+,\d+(?:,\d+)?\)[^(\n]*)+)/g
  const tokRe = /\((\d+),(\d+)(?:,\d+)?\)([^(\n]*)/g
  const out: LyricLine[] = []
  for (const m of yrc.matchAll(lineRe)) {
    const units: NonNullable<LyricLine['units']> = []
    for (const t of m[3]!.matchAll(tokRe)) {
      if (!t[3]) continue
      units.push({ time: parseInt(t[1]!, 10) / 1000, duration: parseInt(t[2]!, 10) / 1000, text: t[3] })
    }
    if (!units.length) continue
    const text = units.map((u) => u.text).join('')
    if (CREDIT_RE.test(text.trim())) continue
    out.push({ time: parseInt(m[1]!, 10) / 1000, duration: parseInt(m[2]!, 10) / 1000, text, units })
  }
  return out.sort((a, b) => a.time - b.time)
}

/** Verbatim timing wins when a track has it; otherwise line-level LRC. */
export function mergeLyrics({ lrc, yrc }: { lrc: string; yrc: string }): LyricLine[] {
  const verbatim = parseYRC(yrc)
  return verbatim.length ? verbatim : parseLRC(lrc)
}
