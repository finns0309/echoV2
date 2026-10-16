// A card as Claude's reply, written in as it streams. Text is set the way a
// reply is: a short first line a heading, emphasis in bold, an annotation a
// quote, a credit a citation chip. A figure is a stat, progress a clay bar,
// a picture a figure with its caption.
import type { Block } from '@contract'
import { progressRatio, valueParts } from '@screen/primitives/blocks'
import { langOf, setLang } from '@screen/primitives/text'
import type { Spot } from './spark'
import { schedule, writtenBy, type Timed } from './stream'

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}

/** A first primary line this short reads as a heading. */
const HEADING_CHARS = 12

function isHeading(blocks: readonly Block[], i: number): boolean {
  const b = blocks[i]!
  return i === 0 && b.type === 'text' && b.role === 'primary' && [...b.text.trim()].length <= HEADING_CHARS && (blocks.length > 1 || !!b.reading)
}

interface Node {
  el: HTMLElement
  /** Text units, written one by one. */
  units: HTMLElement[]
  shown: number
}

function textNode(blocks: readonly Block[], i: number, timed: Timed): Node {
  const b = blocks[i] as Extract<Block, { type: 'text' }>
  const kind = isHeading(blocks, i) ? 'cl-h' : b.role === 'annotation' ? 'cl-q' : b.role === 'attribution' ? 'cl-cite' : 'cl-p'
  const e = el('div', `cl-blk ${kind}`)
  setLang(e, langOf(b))
  const units = timed.units.map((u) => el(u.em ? 'strong' : 'span', 'cl-u', u.text))
  const body = b.role === 'attribution' ? el('span', 'cl-chip') : e
  if (b.reading) {
    const ruby = el('ruby', '')
    ruby.append(...units, el('rt', '', b.reading))
    body.append(ruby)
  } else body.append(...units)
  if (body !== e) e.append(body)
  return { el: e, units, shown: 0 }
}

function fillStat(e: HTMLElement, b: Extract<Block, { type: 'value' }>): void {
  const { label, number, unit, delta } = valueParts(b)
  const n = el('div', 'cl-stat-n')
  n.append(el('span', 'cl-stat-num', number))
  if (unit) n.append(el('span', 'cl-stat-unit', unit))
  if (delta) n.append(el('em', `cl-delta is-${delta.dir}`, delta.text))
  e.replaceChildren(...(label ? [el('div', 'cl-stat-label', label)] : []), n)
}

function fillMeter(e: HTMLElement, b: Extract<Block, { type: 'progress' }>): void {
  const p = progressRatio(b)
  let bar = e.querySelector<HTMLElement>('.cl-meter-bar i')
  if (!bar) {
    const head = el('div', 'cl-meter-head')
    head.append(el('span', 'cl-meter-label'), el('b', 'cl-meter-pct'))
    const track = el('div', 'cl-meter-bar')
    bar = el('i', '')
    track.append(bar)
    e.replaceChildren(head, track)
  }
  e.querySelector('.cl-meter-label')!.textContent = b.label ?? ''
  e.querySelector('.cl-meter-pct')!.textContent = `${Math.round(p * 100)}%`
  bar.style.setProperty('--p', p.toFixed(4))
}

function wholeNode(b: Exclude<Block, { type: 'text' }>): Node {
  const e = el('div', `cl-blk cl-whole cl-${b.type === 'value' ? 'stat' : b.type === 'progress' ? 'meter' : 'figure'}`)
  setLang(e, langOf(b))
  if (b.type === 'value') fillStat(e, b)
  else if (b.type === 'progress') fillMeter(e, b)
  else {
    const img = el('img', '')
    img.src = b.src
    img.alt = b.alt ?? ''
    e.append(img)
    if (b.alt) e.append(el('div', 'cl-caption', b.alt))
  }
  return { el: e, units: [], shown: 0 }
}

export type Phase = 'thinking' | 'writing' | 'done'

/** The pen is this big beside a line of text, against the height of the line. */
const PEN_OF_LINE = 0.62

/** Just after a written unit, on its line. */
function after(u: HTMLElement): Spot {
  const r = u.getBoundingClientRect()
  const size = r.height * PEN_OF_LINE
  return { x: r.right + size * 0.9, y: r.top + r.height / 2, size }
}
/** In the margin before a line, where the pen waits to start it. */
function before(u: HTMLElement): Spot {
  const r = u.getBoundingClientRect()
  const size = r.height * PEN_OF_LINE
  return { x: r.left - size * 0.95, y: r.top + r.height / 2, size }
}
/** In the margin by a block that arrived whole (a figure, a bar, a picture). */
function beside(e: HTMLElement): Spot {
  const r = e.getBoundingClientRect()
  const size = parseFloat(getComputedStyle(e).fontSize) * 1.05
  return { x: r.left - size * 0.95, y: r.top + Math.min(r.height, size * 2) / 2, size }
}

export interface Message {
  readonly el: HTMLElement
  /** Write what is due by `t` seconds on the card's clock. */
  reveal(t: number): Phase
  /** Where the writing is: after the last word, or before the first while it thinks. Null once it is done. */
  pen(): Spot | null
  /** The same card with new data: a figure or a bar moves in place, added lines are written in. */
  update(blocks: readonly Block[], t: number): void
}

/** How much there is to read decides the type size: a few words are set large, a page at reading size. */
export function measureOf(blocks: readonly Block[]): 'brief' | 'short' | 'long' {
  const chars = blocks.reduce((n, b) => n + (b.type === 'text' && b.role !== 'attribution' ? [...b.text].length : 0), 0)
  if (chars <= 30 && blocks.length <= 3) return 'brief'
  return chars <= 90 ? 'short' : 'long'
}

/** `delay`: seconds the spark thinks before the first word. */
export function createMessage(initial: readonly Block[], delay: number): Message {
  const root = el('div', `cl-msg is-${measureOf(initial)}`)
  let blocks = initial
  let timed = schedule(blocks, delay)
  let nodes: Node[] = []
  let phase: Phase = 'thinking'
  /** The latest block that has started. */
  let latest = -1

  function build(from: number): void {
    for (const n of nodes.slice(from)) n.el.remove()
    nodes = nodes.slice(0, from)
    for (let i = from; i < blocks.length; i++) {
      const b = blocks[i]!
      const n = b.type === 'text' ? textNode(blocks, i, timed[i]!) : wholeNode(b)
      nodes.push(n)
      root.append(n.el)
    }
  }
  build(0)

  return {
    el: root,

    reveal(t) {
      latest = -1
      nodes.forEach((n, i) => {
        const { start, units } = timed[i]!
        const on = t >= start
        if (on !== n.el.classList.contains('is-on')) n.el.classList.toggle('is-on', on)
        if (!on) return
        latest = i
        const k = writtenBy(units, t - start)
        while (n.shown < k) n.units[n.shown++]!.classList.add('is-on')
      })
      phase = !timed.length ? 'done' : t < timed[0]!.start ? 'thinking' : t < timed.at(-1)!.end ? 'writing' : 'done'
      return phase
    },

    pen() {
      if (phase === 'done' || !nodes.length) return null
      const n = nodes[Math.max(0, latest)]!
      if (!n.units.length) return beside(n.el)
      return n.shown ? after(n.units[n.shown - 1]!) : before(n.units[0]!)
    },

    update(next, t) {
      let k = 0
      while (k < blocks.length && k < next.length && JSON.stringify(blocks[k]) === JSON.stringify(next[k])) k++
      // A figure or a bar that changed moves where it stands.
      let rebuild = k
      for (; rebuild < Math.min(blocks.length, next.length); rebuild++) {
        const a = blocks[rebuild]!
        const b = next[rebuild]!
        const n = nodes[rebuild]!
        if (a.type === 'value' && b.type === 'value') {
          fillStat(n.el, b)
          n.el.classList.remove('is-changed')
          void n.el.offsetWidth // restart the flash
          n.el.classList.add('is-changed')
        } else if (a.type === 'progress' && b.type === 'progress') fillMeter(n.el, b)
        else if (JSON.stringify(a) !== JSON.stringify(b)) break
      }
      blocks = next
      timed = schedule(blocks, delay, { from: rebuild, notBefore: t })
      if (rebuild < Math.max(nodes.length, next.length)) build(rebuild)
    },
  }
}
