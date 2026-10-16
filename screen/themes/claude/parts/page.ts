// The page: an ivory sheet with nothing on it but words and the spark. At home
// it is Claude's empty page, the spark beside a serif greeting (or the line of
// what plays) and today's conversations under it. In a conversation the newest
// reply is written below the earlier ones, the spark moving along with the
// words like a pen. An artifact opens beside the conversation; on a wide page
// the Recents stand in a rail down the left. There is one spark, and it glides.
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
/** A new reply is brought up to this far down the page, the earlier ones above it. */
const REPLY_TOP = 0.26
/** While writing, the page scrolls to keep the pen at least this far up it. */
const PEN_KEEP = 0.62
/** Conversations listed under the greeting (the rail lists them all). */
const HOME_RECENTS = 4
/** Replies shown in a conversation, the newest last. */
const KEEP_TURNS = 5

/** A line on the home page, written in, and faded out when the next one comes. */
interface HomeLine {
  key: string
  el: HTMLElement
  units: Unit[]
  spans: HTMLElement[]
  born: number
  shown: number
}

/** A conversation as the Recents show it. */
export interface Recent {
  key: string
  name: string
  ago: string
  active: boolean
  /** The spark is writing in it now. */
  writing: boolean
}

export type Place = 'home' | 'chat'

export interface Page {
  readonly spark: Spark
  /** Where an artifact is drawn. */
  readonly pane: HTMLElement
  place(next: Place): void
  header(title: string, byline: string): void
  /**
   * A reply in the conversation. With `past`, the conversation is new to the
   * page and those are its earlier replies; without, it carries on and the
   * replies already there settle into the past where they stand.
   */
  converse(reply: HTMLElement, past?: readonly HTMLElement[]): void
  /** The big line at home; `key` decides whether it is new. `greeting`: the page is empty, so the Recents show under it. */
  homeLine(key: string, text: string, now: number, greeting: boolean): void
  /** The small line under it; `shimmer` for a verb that is still going. */
  homeSub(text: string, shimmer: boolean): void
  recents(list: readonly Recent[]): void
  /** An artifact open beside the conversation, or not. */
  artifact(open: boolean): void
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

function recentRow(r: Recent): HTMLElement {
  const li = el('li', `cl-recent${r.active ? ' is-active' : ''}${r.writing ? ' is-writing' : ''}`)
  const name = el('span', 'cl-recent-name', r.name)
  setLang(name, detectLang(r.name))
  li.append(name, el('span', 'cl-recent-ago', r.ago))
  return li
}

export function createPage(root: HTMLElement): Page {
  const page = el('div', 'cl-page')

  const rail = el('nav', 'cl-rail')
  const railList = el('ol', 'cl-recents')
  rail.append(el('div', 'cl-rail-label', 'Recents'), railList)

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
  const homeRecents = el('div', 'cl-home-recents')
  const homeList = el('ol', 'cl-recents')
  homeRecents.append(el('div', 'cl-rail-label', 'Recents'), homeList)
  home.append(hello, sub, homeRecents)

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

  const pane = el('aside', 'cl-pane')

  const foot = el('footer', 'cl-status')
  const footLine = el('span', 'cl-status-line')
  const footAbout = el('span', 'cl-status-about')
  foot.append(footLine, footAbout)

  const verbEl = el('span', 'cl-verb cl-shimmer')
  const ring = el('div', 'cl-ring')
  const spark = createSpark('cl-spark')
  page.append(rail, head, home, chat, pane, foot, ring, verbEl, spark.el)
  root.append(page)

  let where: Place = 'home'
  let current: HomeLine | null = null
  let reply: HTMLElement | null = null
  let listed = ''
  const pos = { x: 0, y: 0, s: 0, placed: false }
  let scrollY = 0

  function spotOf(e: HTMLElement): Spot {
    const r = e.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, size: r.width }
  }

  return {
    spark,
    pane,

    place(next) {
      where = next
      page.classList.toggle('is-chat', next === 'chat')
    },

    header(title, byline) {
      headTitle.textContent = title
      headBy.textContent = byline
      setLang(head, detectLang(title + byline))
    },

    converse(next, past) {
      reply = next
      if (past) {
        column.replaceChildren(...past, next)
        scrollY = scroller.scrollTop = 0
        return
      }
      for (const turn of column.children) turn.classList.add('is-past')
      column.append(next)
      while (column.children.length > KEEP_TURNS) column.firstElementChild!.remove()
    },

    homeLine(key, text, now, greeting) {
      page.classList.toggle('is-greeting', greeting)
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

    recents(list) {
      const key = JSON.stringify(list)
      if (key === listed) return
      listed = key
      railList.replaceChildren(...list.map(recentRow))
      homeList.replaceChildren(...list.slice(0, HOME_RECENTS).map(recentRow))
      page.classList.toggle('has-recents', list.length > 0)
    },

    artifact(open) {
      page.classList.toggle('has-artifact', open)
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

      // The newest reply is brought up the page, the earlier ones above it fading
      // under the top edge; a long one scrolls on to keep the pen in view.
      const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
      if (where === 'chat' && max > 0 && reply) {
        const s = scroller.getBoundingClientRect()
        const top = reply.getBoundingClientRect().top - s.top + scroller.scrollTop
        const want = Math.max(top - scroller.clientHeight * REPLY_TOP, at.y - s.top + scroller.scrollTop - scroller.clientHeight * PEN_KEEP)
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
      verbEl.style.transform = `translate(${(pos.x + pos.s * SPARK_PX * 0.85).toFixed(2)}px, ${pos.y.toFixed(2)}px) translateY(-50%)`
      spark.step(dt)
    },

    remove() {
      page.remove()
    },
  }
}
