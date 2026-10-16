// The page: an ivory sheet with nothing on it but words and the spark. At home
// it is Claude's empty page, the spark beside a serif greeting (or the line of
// what plays). In a conversation the reply is set in the middle of the page and
// written in, the spark moving along with the words like a pen; what plays
// drops to a status line at the foot. There is one spark, and it glides.
import { detectLang, setLang } from '@screen/primitives/text'
import { createSpark, type Spark, type Spot } from './spark'
import { unitsOf, writtenBy, type Unit } from './stream'

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}

/** The spark is drawn at this size and scaled to whichever place it is in. */
const SPARK_PX = 80
/** How quickly it glides to a new place (per second). Along a line it keeps up with the words, as a cursor does. */
const GLIDE = 7
const GLIDE_LINE = 45
/** A home line fades this long before the next is written. */
const LINE_CLEAR_MS = 380
/** While writing, the page scrolls to keep the pen this far down the column. */
const PEN_KEEP = 0.62

/** A line on the home page, written in, and faded out when the next one comes. */
interface HomeLine {
  key: string
  el: HTMLElement
  units: Unit[]
  spans: HTMLElement[]
  born: number
  shown: number
}

export type Place = 'home' | 'chat'

export interface Page {
  readonly spark: Spark
  /** The column a reply is set in. */
  readonly column: HTMLElement
  place(next: Place): void
  header(title: string, byline: string): void
  /** The big line at home; `key` decides whether it is new. */
  homeLine(key: string, text: string, now: number): void
  /** The small line under it; `shimmer` for a verb that is still going. */
  homeSub(text: string, shimmer: boolean): void
  /** The verb beside the spark while it thinks (empty: none). */
  verb(text: string): void
  /** What plays, at the foot of a conversation (null: nothing). */
  status(line: string | null, about: string): void
  /** Salience on the page: quiet text, or a ring for something to glance at. */
  tone(quiet: boolean): void
  alert(): void
  /**
   * Move everything toward where it should be. `pen` is where the writing is,
   * in a conversation; without one the spark rests under the reply.
   */
  frame(now: number, dt: number, pen: Spot | null): void
  remove(): void
}

export function createPage(root: HTMLElement): Page {
  const page = el('div', 'cl-page')

  const head = el('header', 'cl-head')
  const headTitle = el('span', 'cl-head-title')
  const headBy = el('span', 'cl-head-by')
  head.append(headTitle, headBy)

  const home = el('section', 'cl-home')
  const hello = el('div', 'cl-hello')
  const homeAnchor = el('i', 'cl-anchor cl-anchor-home')
  const lines = el('div', 'cl-lines')
  hello.append(homeAnchor, lines)
  const sub = el('div', 'cl-sub')
  home.append(hello, sub)

  const chat = el('section', 'cl-chat')
  const scroller = el('div', 'cl-scroll')
  const stack = el('div', 'cl-stack')
  const column = el('div', 'cl-col')
  const tail = el('div', 'cl-tail')
  const tailAnchor = el('i', 'cl-anchor cl-anchor-tail')
  tail.append(tailAnchor)
  stack.append(column, tail)
  scroller.append(stack)
  chat.append(scroller)

  const foot = el('footer', 'cl-status')
  const footLine = el('span', 'cl-status-line')
  const footAbout = el('span', 'cl-status-about')
  foot.append(footLine, footAbout)

  const verbEl = el('span', 'cl-verb cl-shimmer')
  const ring = el('div', 'cl-ring')
  const spark = createSpark('cl-spark')
  page.append(head, home, chat, foot, ring, verbEl, spark.el)
  root.append(page)

  let where: Place = 'home'
  let current: HomeLine | null = null
  const pos = { x: 0, y: 0, s: 0, placed: false }
  let scrollY = 0

  function spotOf(e: HTMLElement): Spot {
    const r = e.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, size: r.width }
  }

  return {
    spark,
    column,

    place(next) {
      where = next
      page.classList.toggle('is-chat', next === 'chat')
      if (next === 'chat') scrollY = scroller.scrollTop = 0
    },

    header(title, byline) {
      headTitle.textContent = title
      headBy.textContent = byline
      setLang(head, detectLang(title + byline))
    },

    homeLine(key, text, now) {
      if (current?.key === key) return
      // The old line clears before the new one is written over it.
      const wait = current ? LINE_CLEAR_MS : 0
      if (current) {
        const old = current.el
        old.classList.add('is-leaving')
        setTimeout(() => old.remove(), 700)
      }
      const e = el('div', 'cl-line')
      setLang(e, detectLang(text))
      const units = unitsOf(text)
      const spans = units.map((u) => el('span', 'cl-u', u.text))
      e.append(...spans)
      lines.append(e)
      current = { key, el: e, units, spans, born: now + wait, shown: 0 }
    },

    homeSub(text, shimmer) {
      if (sub.textContent !== text) sub.textContent = text
      sub.classList.toggle('cl-shimmer', shimmer)
      setLang(sub, detectLang(text))
    },

    verb(text) {
      if (text && verbEl.textContent !== text) verbEl.textContent = text
      page.classList.toggle('is-thinking', !!text)
    },

    status(line, about) {
      page.classList.toggle('has-status', line !== null)
      if (line === null) return
      if (footLine.textContent !== line) {
        footLine.textContent = line
        footLine.classList.remove('is-new')
        void footLine.offsetWidth
        footLine.classList.add('is-new')
      }
      footAbout.textContent = about
      setLang(foot, detectLang(line + about))
    },

    tone(quiet) {
      page.classList.toggle('is-quiet', quiet)
    },

    alert() {
      ring.classList.remove('is-on')
      void ring.offsetWidth
      ring.classList.add('is-on')
    },

    frame(now, dt, pen) {
      // The home line writes itself in.
      if (current) {
        const k = writtenBy(current.units, (now - current.born) / 1000)
        while (current.shown < k) current.spans[current.shown++]!.classList.add('is-on')
      }

      const p = page.getBoundingClientRect()
      const at = where === 'chat' ? (pen ?? spotOf(tailAnchor)) : spotOf(homeAnchor)

      // A reply longer than the page scrolls up under a fade, keeping the pen in view.
      const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
      if (where === 'chat' && max > 0) {
        const s = scroller.getBoundingClientRect()
        const want = pen ? at.y - s.top + scroller.scrollTop - scroller.clientHeight * PEN_KEEP : max
        scrollY += (Math.max(0, Math.min(max, want)) - scrollY) * (1 - Math.exp(-dt * 4))
        if (Math.abs(scroller.scrollTop - scrollY) >= 0.5) scroller.scrollTop = scrollY
      }
      scroller.classList.toggle('is-scrolled', scroller.scrollTop > 2)

      // The spark glides to its place, and grows or shrinks to fit it.
      const tx = at.x - p.left
      const ty = at.y - p.top
      const ts = at.size / SPARK_PX
      if (!pos.placed || !p.width) Object.assign(pos, { x: tx, y: ty, s: ts, placed: p.width > 0 })
      else {
        const k = 1 - Math.exp(-dt * GLIDE)
        const along = pen && where === 'chat' && Math.abs(ty - pos.y) < at.size * 0.6
        pos.x += (tx - pos.x) * (along ? 1 - Math.exp(-dt * GLIDE_LINE) : k)
        pos.y += (ty - pos.y) * k
        pos.s += (ts - pos.s) * k
      }
      spark.el.style.transform = `translate(${(pos.x - SPARK_PX / 2).toFixed(2)}px, ${(pos.y - SPARK_PX / 2).toFixed(2)}px) scale(${pos.s.toFixed(4)})`
      // The verb sits just after the spark, on its line.
      verbEl.style.transform = `translate(${(pos.x + (pos.s * SPARK_PX) * 0.85).toFixed(2)}px, ${pos.y.toFixed(2)}px) translateY(-50%)`
      spark.step(dt)
    },

    remove() {
      page.remove()
    },
  }
}
