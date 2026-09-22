// The 新世纪 layout engine: given one line of text and a template, set it well.
// Word-safe breaks, measured fit, per-template composition. Ported from echo's
// eva.js; the templates and their tuning are unchanged.
import { hash, latinRatio, pickKeyword, segment, type Span } from '@screen/primitives/text'
import type { CardDirection } from '../grammar'

export const TEMPLATES = ['whisper', 'stack', 'vert', 'corner', 'dual', 'giant', 'bleed'] as const
export type Template = (typeof TEMPLATES)[number] | 'repeat'

interface Unit {
  text: string
  start: number
  len: number
  word: boolean
  space: boolean
  em: number
}
interface Pair {
  ch: string
  idx: number
}
type Row = Pair[]

interface Ctx {
  text: string
  W: number
  H: number
  h: number
  us: Unit[]
  kw: Span | null
  latinish: boolean
  rep: Row[] | null
  brk: string[] | undefined
}

const cps = (s: string) => [...s]
const isLatinCh = (ch: string) => /[A-Za-z0-9'’.,!?-]/.test(ch)
// CJK glyphs run ~1em, latin ~0.58em, spaces ~0.3em. Only a first estimate for
// choosing breaks and row counts; the final size always comes from fit().
const chEm = (ch: string) => (ch === ' ' ? 0.3 : isLatinCh(ch) ? 0.58 : 1)
const strEm = (s: string) => cps(s).reduce((w, c) => w + chEm(c), 0)
// Never open a row with one of these (closing punctuation, particles).
const NO_LEAD = '的了吧呢啊呀哦嘛吗着过得地、,，。.!！?？」』）)・をにがはでともへ'

function units(text: string): Unit[] {
  return segment(text).map((g) => ({ ...g, space: /^\s+$/.test(g.text), em: strEm(g.text) }))
}

function rowsFromCuts(us: Unit[], cuts: number[]): Row[] {
  const rows: Unit[][] = []
  let from = 0
  for (const c of [...cuts, us.length]) {
    let seg = us.slice(from, c)
    while (seg.length && seg[0]!.space) seg = seg.slice(1)
    while (seg.length && seg[seg.length - 1]!.space) seg = seg.slice(0, -1)
    if (seg.length) rows.push(seg)
    from = c
  }
  return rows.map((seg) => seg.flatMap((u) => cps(u.text).map((ch, j) => ({ ch, idx: u.start + j }))))
}
const pairsEm = (pairs: Row) => pairs.reduce((w, p) => w + chEm(p.ch), 0)

// Best split into exactly k rows. Score = widest row (em) + a charge per cut
// that isn't at the text's own spaces (those are phrase boundaries); a row may
// never open with a particle or closing punctuation. Lines are short, so this
// just enumerates, with a budget.
function splitK(us: Unit[], k: number): number[] | null {
  const n = us.length
  if (k <= 1) return []
  if (n < k) return null
  const pre = [0]
  for (const u of us) pre.push(pre[pre.length - 1]! + u.em)
  const joined = us.map((u) => u.text).join('')
  const cost = (i: number) => {
    const cur = us[i]!
    const prev = us[i - 1]!
    if (cur.space || prev.space) return 0
    if (NO_LEAD.includes(cps(cur.text)[0]!)) return Infinity
    const tail = prev.text.slice(-1)
    const head = cur.text[0]!
    if (/[っゃゅょッャュョー]/.test(tail) || /[っゃゅょッャュョー]/.test(head)) return Infinity
    // kanji stem | okurigana (座っ|た, 巡り|合う): legal only as a last resort
    if (/\p{Script=Han}|[\u3040-\u309f]/u.test(tail) && /[\u3040-\u309f]/.test(head) && /[\u3040-\u30ff]/.test(joined)) return 2.4
    if ('的了着过地得'.includes(tail)) return 0.5 // after a particle is where Chinese breathes
    return 0.9
  }
  let best: number[] | null = null
  let bestScore = Infinity
  let budget = 60000
  const cuts: number[] = []
  const rec = (from: number, left: number, maxW: number, pen: number): void => {
    if (budget-- <= 0 || maxW + pen >= bestScore) return
    if (left === 0) {
      const sc = Math.max(maxW, pre[n]! - pre[from]!) + pen
      if (sc < bestScore) {
        bestScore = sc
        best = cuts.slice()
      }
      return
    }
    for (let i = from + 1; i <= n - left; i++) {
      const c = cost(i)
      if (c === Infinity) continue
      cuts.push(i)
      rec(i, left - 1, Math.max(maxW, pre[i]! - pre[from]!), pen + c)
      cuts.pop()
    }
  }
  rec(0, k - 1, 0, 0)
  return best
}

// Director-supplied break points → unit cuts; null if any of them misses.
function cutsFromBrk(text: string, us: Unit[], brk: string[] | undefined): number[] | null {
  if (!brk?.length) return null
  const cuts: number[] = []
  let fromU16 = 1
  for (const b of brk) {
    const u16 = text.indexOf(b, fromU16)
    if (u16 < 0) return null
    const cp = cps(text.slice(0, u16)).length
    const ui = us.findIndex((u) => u.start >= cp) // snap forward to a unit edge
    if (ui <= 0 || cuts.includes(ui)) return null
    cuts.push(ui)
    fromU16 = u16 + b.length
  }
  return cuts
}

// Rows that maximize type size inside a W×H box (1..maxK rows).
function bestRows(text: string, us: Unit[], boxW: number, boxH: number, maxK: number, brk: string[] | undefined | null): Row[] {
  const forced = cutsFromBrk(text, us, brk ?? undefined)
  if (forced) return rowsFromCuts(us, forced)
  // The text's own spaces are phrase boundaries: rows = phrases. Only a phrase
  // too long for one row (> 9em) gets split again, by words.
  const spaceCuts = us.map((u, i) => (u.space ? i : -1)).filter((i) => i > 0 && i < us.length - 1)
  if (spaceCuts.length >= 1 && spaceCuts.length <= 3 && maxK >= spaceCuts.length + 1) {
    const rows: Row[] = []
    let from = 0
    for (const c of [...spaceCuts, us.length]) {
      const part = us.slice(from, c).filter((u) => !u.space)
      from = c
      if (!part.length) continue
      const em = part.reduce((w, u) => w + u.em, 0)
      const sub = em > 9 && rows.length + 2 <= maxK + 1 ? splitK(part, 2) : null
      rows.push(...rowsFromCuts(part, sub ?? []))
    }
    if (rows.length <= maxK + 1) return rows
  }
  let best: { fs: number; rows: Row[] } | null = null
  for (let k = 1; k <= maxK; k++) {
    const cuts = splitK(us, k)
    if (!cuts) continue
    const rows = rowsFromCuts(us, cuts)
    const fs = Math.min(boxW / Math.max(...rows.map(pairsEm)), boxH / (rows.length * 1.04))
    if (!best || fs > best.fs * 1.06) best = { fs, rows } // a new row must earn a real gain
  }
  return best ? best.rows : [cps(text).map((ch, i) => ({ ch, idx: i }))]
}

// ── DOM helpers ─────────────────────────────────────────────────────────────
function rowDiv(pairs: Row, cls = ''): HTMLDivElement {
  const d = document.createElement('div')
  d.className = 'ev-row' + (cls ? ` ${cls}` : '')
  for (const p of pairs) {
    const s = document.createElement('span')
    s.dataset.idx = String(p.idx)
    s.textContent = p.ch === ' ' ? '\u00a0' : p.ch // NBSP survives whitespace collapse
    d.appendChild(s)
  }
  return d
}
const allPairs = (text: string): Row => cps(text).map((ch, i) => ({ ch, idx: i }))

function markRed(scope: Element, kw: Span | null): void {
  if (!kw) return
  scope.querySelectorAll<HTMLElement>('span[data-idx]').forEach((s) => {
    const i = Number(s.dataset.idx)
    if (i >= kw.start && i < kw.start + kw.len) s.classList.add('red')
  })
}
function el(cls: string, ...kids: Node[]): HTMLDivElement {
  const d = document.createElement('div')
  d.className = cls
  kids.forEach((k) => d.appendChild(k))
  return d
}
// Measured fit: type scales linearly, so one measure at a probe size gives the
// exact size that fills the box.
function fit(node: HTMLElement, boxW: number, boxH: number, cap?: number): number {
  node.style.fontSize = '100px'
  const w = node.scrollWidth || 1
  const h = node.scrollHeight || 1
  const fs = Math.min((100 * boxW) / w, (100 * boxH) / h, cap ?? Infinity)
  node.style.fontSize = `${fs.toFixed(1)}px`
  return fs
}
// Fit a block of rows by its widest row (rows are block-level, so the wrapper
// itself always measures 100% wide).
function fitRows(wrap: HTMLElement, boxW: number, boxH: number, cap?: number): number {
  wrap.style.fontSize = '100px'
  let w = 1
  let h = 0
  wrap.querySelectorAll<HTMLElement>('.ev-row').forEach((r) => {
    r.style.width = 'max-content'
    w = Math.max(w, r.offsetWidth + (parseFloat(r.style.marginLeft) || 0) * 100)
    r.style.width = ''
    h += r.offsetHeight
  })
  const fs = Math.min((100 * boxW) / w, (100 * boxH) / (h || 1), cap ?? Infinity)
  wrap.style.fontSize = `${fs.toFixed(1)}px`
  return fs
}

// "你说 你说 你说" → one row per repeat when the line is ≥2 repeats of one unit.
function detectRepeat(text: string): Row[] | null {
  const parts = text.split(/\s+/).filter(Boolean)
  if (parts.length < 2 || parts.length > 5 || new Set(parts).size !== 1) return null
  const rows: Row[] = []
  let from = 0
  for (const p of parts) {
    const u16 = text.indexOf(p, from)
    const cp = cps(text.slice(0, u16)).length
    rows.push(cps(p).map((ch, j) => ({ ch, idx: cp + j })))
    from = u16 + p.length
  }
  return rows
}

// Without a director: pick from what the line IS (length, phrase break, script);
// the hash only breaks ties, so repeats stay identical. Never whisper or white:
// strong statements are the director's.
function heuristicTpl(ctx: Ctx): Template {
  const { text, h, latinish } = ctx
  const n = cps(text.replace(/\s+/g, '')).length
  if (strEm(text) <= 5.2) return 'bleed'
  if (!latinish && /\S\s+\S/.test(text) && h % 2 === 0) return 'corner'
  if (!latinish && n <= 12 && (h >> 3) % 3 === 0) return 'vert'
  if (n >= 8 && (h >> 5) % 4 === 0) return 'dual'
  if ((h >> 7) % 5 === 0) return 'giant'
  return 'stack'
}

export function createCard(card: HTMLElement) {
  // Each template returns true if it could set the line (false → fall back to stack).
  const T: Record<Template, (ctx: Ctx) => boolean> = {
    // Quiet intertitle: one small line dead center. No red: nothing shouts here.
    whisper(ctx) {
      const w = el('ev-whisper', rowDiv(allPairs(ctx.text)))
      card.appendChild(w)
      fit(w, ctx.W * 0.7, ctx.H * 0.2, ctx.H * 0.05)
      return true
    },
    // Full-bleed rows, alternating edges.
    stack(ctx) {
      const rows = bestRows(ctx.text, ctx.us, ctx.W * 0.9, ctx.H * 0.84, 5, ctx.brk)
      const wrap = el('ev-stack')
      const align = rows.length === 1 ? ['ev-r-left'] : ['ev-r-left', 'ev-r-right', 'ev-r-mid']
      rows.forEach((r, i) => wrap.appendChild(rowDiv(r, align[i % align.length])))
      card.appendChild(wrap)
      fitRows(wrap, ctx.W * 0.9, ctx.H * 0.84, ctx.H * 0.34)
      markRed(wrap, ctx.kw)
      return true
    },
    // Vertical columns, right to left, each later column hung lower. CJK only.
    vert(ctx) {
      if (ctx.latinish) return false
      const n = cps(ctx.text.replace(/\s+/g, '')).length
      const spaceCuts = ctx.us.map((u, i) => (u.space ? i : -1)).filter((i) => i > 0 && i < ctx.us.length - 1)
      const k = n <= 7 ? 1 : n <= 16 ? 2 : 3
      const cuts =
        cutsFromBrk(ctx.text, ctx.us, ctx.brk) ?? (spaceCuts.length >= 1 && spaceCuts.length <= 2 ? spaceCuts : splitK(ctx.us, k))
      if (!cuts) return false
      const wrap = el('ev-vert')
      rowsFromCuts(ctx.us, cuts).forEach((c, i) => {
        const d = rowDiv(c)
        d.style.marginTop = `${(i * 1.15).toFixed(2)}em`
        wrap.appendChild(d)
      })
      card.appendChild(wrap)
      fit(wrap, ctx.W * 0.5, ctx.H * 0.86, ctx.H * 0.24)
      markRed(wrap, ctx.kw)
      return true
    },
    // 直角组版: first phrase large and horizontal from the top-left, second
    // phrase hanging vertically down the right edge. Needs a phrase break.
    corner(ctx) {
      const { text, W, H, us, kw, brk } = ctx
      let cuts = cutsFromBrk(text, us, brk?.slice(0, 1))
      if (!cuts) {
        const spaces = us.map((u, i) => (u.space ? i : -1)).filter((i) => i > 0 && i < us.length - 1)
        if (!spaces.length) return false
        const mid = strEm(text) / 2
        let acc = 0
        let bestI = spaces[0]!
        let bestD = Infinity
        us.forEach((u, i) => {
          if (spaces.includes(i) && Math.abs(acc - mid) < bestD) {
            bestD = Math.abs(acc - mid)
            bestI = i
          }
          acc += u.em
        })
        cuts = [bestI]
      }
      const [a, b] = rowsFromCuts(us, cuts)
      if (!a || !b) return false
      if (b.filter((p) => isLatinCh(p.ch)).length > b.length * 0.34) return false // vertical latin
      if (b.length > 10) return false // a long hanging column shrinks to a footnote
      const vb = el('ev-corner-b', rowDiv(b))
      card.appendChild(vb)
      const fsB = fit(vb, W * 0.2, H * 0.84, H * 0.2)
      const boxW = W * 0.86 - fsB * 1.5
      const aText = a.map((p) => p.ch).join('')
      const aUs = units(aText).map((u) => ({ ...u, start: u.start + a[0]!.idx }))
      const ha = el('ev-corner-a')
      bestRows(aText, aUs, boxW, H * 0.5, 2, null).forEach((r) => ha.appendChild(rowDiv(r)))
      card.appendChild(ha)
      fitRows(ha, boxW, H * 0.5, H * 0.3)
      markRed(card, kw)
      return true
    },
    // Diagonal opposition: first phrase top-left, second bottom-right.
    dual(ctx) {
      const cuts = cutsFromBrk(ctx.text, ctx.us, ctx.brk?.slice(0, 1)) ?? splitK(ctx.us, 2)
      if (!cuts) return false
      const [pa, pb] = rowsFromCuts(ctx.us, cuts)
      if (!pa || !pb) return false
      const a = el('ev-dual-a', rowDiv(pa))
      const b = el('ev-dual-b', rowDiv(pb))
      card.append(a, b)
      const fs = Math.min(fit(a, ctx.W * 0.68, ctx.H * 0.3, ctx.H * 0.22), fit(b, ctx.W * 0.68, ctx.H * 0.3, ctx.H * 0.22))
      a.style.fontSize = b.style.fontSize = `${fs.toFixed(1)}px`
      markRed(card, ctx.kw)
      return true
    },
    // The keyword alone, enormous; the full line as a legible caption.
    giant(ctx) {
      const chars = cps(ctx.text)
      const { kw } = ctx
      if (!kw || kw.len >= chars.filter((c) => c !== ' ').length) return false // that's a bleed card
      const g = el('ev-giant')
      g.textContent = chars.slice(kw.start, kw.start + kw.len).join('')
      card.appendChild(g)
      fit(g, ctx.W * 0.9, ctx.H * 0.6, ctx.H * 0.6)
      const rest = el('ev-giant-rest', rowDiv(allPairs(ctx.text)))
      card.appendChild(rest)
      fit(rest, ctx.W * 0.6, ctx.H * 0.1, ctx.H * 0.052)
      markRed(rest, kw)
      return true
    },
    // 满版: a short line fills the whole frame, edges bleeding.
    bleed(ctx) {
      if (strEm(ctx.text) > 5.2) return false
      const b = el('ev-bleed', rowDiv(allPairs(ctx.text)))
      card.appendChild(b)
      fit(b, ctx.W * 1.03, ctx.H * 0.92, ctx.H * 0.92)
      // Red only when it singles out PART of the line; a lone glyph goes red whole.
      const n = cps(ctx.text).filter((c) => c !== ' ').length
      if (n === 1 || (ctx.kw && ctx.kw.len < n)) markRed(b, n === 1 ? { start: 0, len: cps(ctx.text).length } : ctx.kw)
      return true
    },
    // 反复: one unit per row, stepping right, the last one red.
    repeat(ctx) {
      if (!ctx.rep) return false
      const wrap = el('ev-repeat')
      ctx.rep.forEach((pairs, i) => {
        const d = rowDiv(pairs, i === ctx.rep!.length - 1 ? 'red-row' : '')
        d.style.marginLeft = `${(i * 0.9).toFixed(2)}em`
        wrap.appendChild(d)
      })
      card.appendChild(wrap)
      fitRows(wrap, ctx.W * 0.86, ctx.H * 0.84, ctx.H * 0.3)
      return true
    },
  }

  function slam(): void {
    card.classList.remove('slam')
    void card.offsetWidth // restart the animation
    card.classList.add('slam')
  }

  return {
    render(text: string, direction: CardDirection | null, emphasis?: string): void {
      const root = card.parentElement ?? card
      const ctx: Ctx = {
        text,
        W: root.clientWidth || 1440,
        H: root.clientHeight || 900,
        h: hash(text),
        us: units(text),
        kw: pickKeyword(text, direction?.kw ?? emphasis),
        latinish: latinRatio(text) > 0.34,
        rep: detectRepeat(text),
        brk: direction?.brk,
      }
      // repeat is structural (the engine sees it); otherwise the director, else the heuristic
      const directed = direction?.tpl && (TEMPLATES as readonly string[]).includes(direction.tpl) ? (direction.tpl as Template) : null
      const want: Template = ctx.rep ? 'repeat' : (directed ?? heuristicTpl(ctx))
      for (const tpl of [want, 'stack'] as Template[]) {
        card.className = `ev-card ev-tpl-${tpl}${direction?.inv ? ' ev-invert' : ''}`
        card.replaceChildren()
        if (T[tpl](ctx)) break
      }
      slam()
    },

    /** 待機: the standby card between pieces of content. */
    idle(): void {
      card.className = 'ev-card ev-tpl-idle'
      card.innerHTML = '<div class="ev-idle-v">待機</div><div class="ev-idle-sub">ACTIVITY : NONE</div>'
    },
  }
}
