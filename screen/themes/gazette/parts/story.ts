// One story, set the way a paper sets it. A presentation's parts map onto a
// newspaper's: the title is the section kicker, the primary line the headline,
// secondary lines the dek, values and progress are figures and a printed chart,
// a picture is a halftone photo, annotations are the editor's aside (◇), and the
// attribution is the credit line 【…】. Everything is printed at once: a page
// doesn't reveal itself line by line.
import type { Block, Presentation, Salience } from '@contract'
import { progressRatio, valueParts } from '@screen/primitives/blocks'
import { detectLang, setLang } from '@screen/primitives/text'

type Text = Extract<Block, { type: 'text' }>
type Value = Extract<Block, { type: 'value' }>
type Progress = Extract<Block, { type: 'progress' }>

const COUNT_MS = 900
const SHORT = 12 // characters
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
const format = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
const percent = (b: Progress) => `${Math.round(progressRatio(b) * 1000) / 10}%`

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}

/** A line of type: the emphasis gets sesame dots (傍点), a reading sits above as ruby. */
function typeset(into: HTMLElement, b: Text): HTMLElement {
  const i = b.emphasis ? b.text.indexOf(b.emphasis) : -1
  const parts: (string | HTMLElement)[] =
    i < 0 ? [b.text] : [b.text.slice(0, i), el('em', 'gz-dots', b.emphasis), b.text.slice(i + b.emphasis!.length)]
  if (b.reading) {
    const ruby = document.createElement('ruby')
    ruby.append(...parts, el('rt', '', b.reading))
    into.append(ruby)
  } else into.append(...parts)
  return into
}

function figure(b: Value): HTMLElement {
  const { label, number, unit, delta } = valueParts(b)
  const f = el('figure', 'gz-fig')
  if (label) f.append(el('figcaption', '', label))
  const line = el('div', 'gz-num')
  const n = el('span', 'n', number)
  if (typeof b.value === 'number') n.dataset.value = String(b.value)
  line.append(n)
  if (unit) line.append(el('span', 'u', unit))
  if (delta) line.append(el('span', `d ${delta.dir}`, `${delta.dir === 'up' ? '▲' : delta.dir === 'down' ? '▼' : '―'}${delta.text.slice(1)}`))
  f.append(line)
  return f
}

function chart(b: Progress): HTMLElement {
  const f = el('figure', 'gz-fig gz-chart')
  const head = el('figcaption', '')
  head.append(el('span', '', b.label ?? ''), el('span', 'gz-pct', percent(b)))
  const bar = el('div', 'gz-bar')
  const fill = el('i', '')
  fill.style.setProperty('--p', progressRatio(b).toFixed(4))
  bar.append(fill)
  f.append(head, bar)
  return f
}

/** A photo in halftone: the picture and a dot screen, thresholded (see theme.css). */
export function photo(src: string, alt = ''): HTMLElement {
  const f = el('figure', 'gz-photo')
  const img = el('img', '')
  img.src = src
  img.alt = alt
  img.decoding = 'async'
  f.append(img)
  return f
}

/** Set a presentation as a story. */
export function story(p: Presentation, salience: Salience): HTMLElement {
  const a = el('article', 'gz-story')
  a.dataset.salience = salience
  const texts = p.blocks.filter((b): b is Text => b.type === 'text')
  setLang(a, detectLang(texts.map((t) => t.text).join('')))

  // The section kicker; news that can't wait gets one even without a section (速報, in CSS).
  if (p.context.title || salience === 'attention') {
    const k = el('div', 'gz-kicker')
    if (p.context.title) k.append(el('i', 'gz-mark'), p.context.title)
    // The content's own colour, as a small spot of second ink.
    if (p.context.palette?.[0]) k.style.setProperty('--gz-spot', p.context.palette[0])
    a.append(k)
  }
  for (const b of p.blocks) if (b.type === 'image') a.append(photo(b.src, b.alt))

  const head = texts.find((t) => t.role === 'primary')
  if (head) {
    a.append(typeset(el('h2', 'gz-head'), head))
    // A short headline is set bigger, as a paper gives a few words the whole width.
    if ([...head.text].length <= SHORT) a.classList.add('gz-short')
  }
  for (const t of texts) if (t.role === 'secondary') a.append(typeset(el('p', 'gz-dek'), t))
  for (const b of p.blocks) {
    if (b.type === 'value') a.append(figure(b))
    else if (b.type === 'progress') a.append(chart(b))
  }
  for (const t of texts) if (t.role === 'annotation' || (t.role === 'primary' && t !== head)) a.append(typeset(el('p', 'gz-aside'), t))

  const credits = [
    ...texts.filter((t) => t.role === 'attribution').map((t) => t.text),
    ...(p.context.byline ? [`文・${p.context.byline}`] : p.context.speaker ? [`文・${p.context.speaker.name}`] : []),
  ]
  if (credits.length) a.append(el('p', 'gz-credit', `【${credits.join(' ・ ')}】`))
  return a
}

/**
 * The same story with new numbers, set again: figures count from the old value
 * to the new, a chart's bar slides, and the figure is struck like a stamp.
 */
export function restate(next: HTMLElement, before: Presentation, after: Presentation): void {
  const figures = [...next.querySelectorAll<HTMLElement>('.gz-fig')]
  const old = before.blocks.filter((b) => b.type === 'value' || b.type === 'progress')
  const now = after.blocks.filter((b) => b.type === 'value' || b.type === 'progress')
  now.forEach((b, i) => {
    const f = figures[i]
    const was = old[i]
    if (!f || !was || was.type !== b.type) return
    if (b.type === 'value' && was.type === 'value') {
      if (typeof b.value !== 'number' || typeof was.value !== 'number' || b.value === was.value) return
      const n = f.querySelector<HTMLElement>('.n')
      if (n) count(n, was.value, b.value, (v) => format.format(v))
      strike(f)
    } else if (b.type === 'progress' && was.type === 'progress') {
      const fill = f.querySelector<HTMLElement>('.gz-bar i')
      const pct = f.querySelector<HTMLElement>('.gz-pct')
      if (fill) {
        fill.style.setProperty('--p', progressRatio(was).toFixed(4))
        requestAnimationFrame(() => requestAnimationFrame(() => fill.style.setProperty('--p', progressRatio(b).toFixed(4))))
      }
      if (pct) count(pct, progressRatio(was) * 100, progressRatio(b) * 100, (v) => `${Math.round(v * 10) / 10}%`)
    }
  })
}

function count(node: HTMLElement, from: number, to: number, text: (n: number) => string): void {
  const start = performance.now()
  const tick = (now: number) => {
    if (!node.isConnected) return
    const t = Math.min(1, (now - start) / COUNT_MS)
    node.textContent = text(from + (to - from) * easeOut(t))
    if (t < 1) requestAnimationFrame(tick)
  }
  node.textContent = text(from)
  requestAnimationFrame(tick)
}

function strike(f: HTMLElement): void {
  f.classList.remove('gz-struck')
  void f.offsetWidth
  f.classList.add('gz-struck')
}
