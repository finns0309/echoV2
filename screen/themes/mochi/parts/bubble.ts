// What the mochi says, in a speech bubble over its head: who or what it is about in
// small type, any figures (a number on a little sign, a progress bar, a picture),
// and the line it is saying now. What plays it only hums, in a lighter bubble; and
// a mark can hang by its head: "!", "zzz", "♪".
import type { Block, Presentation, Salience } from '@contract'
import { progressRatio, valueParts } from '@screen/primitives/blocks'
import { detectLang, setLang } from '@screen/primitives/text'
import type { Mark } from './motion'

type Text = Extract<Block, { type: 'text' }>

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}

function line(b: Text): HTMLElement {
  const p = el('p', 'mc-line')
  const i = b.emphasis ? b.text.indexOf(b.emphasis) : -1
  const parts: (string | HTMLElement)[] = i < 0 ? [b.text] : [b.text.slice(0, i), el('strong', '', b.emphasis), b.text.slice(i + b.emphasis!.length)]
  if (b.reading) {
    const r = document.createElement('ruby')
    r.append(...parts, el('rt', '', b.reading))
    p.append(r)
  } else p.append(...parts)
  return p
}

function figure(b: Block): HTMLElement | null {
  if (b.type === 'value') {
    const { label, number, unit, delta } = valueParts(b)
    const f = el('div', 'mc-sign')
    if (label) f.append(el('small', '', label))
    const n = el('b', '', number)
    if (unit) n.append(el('span', '', unit))
    if (delta) n.append(el('em', `is-${delta.dir}`, delta.text))
    f.append(n)
    return f
  }
  if (b.type === 'progress') {
    const f = el('div', 'mc-meter')
    const head = el('small', '')
    head.append(el('span', '', b.label ?? ''), el('b', '', `${Math.round(progressRatio(b) * 100)}%`))
    const bar = el('div', 'mc-meter-bar')
    const fill = el('i', '')
    fill.style.setProperty('--p', progressRatio(b).toFixed(4))
    bar.append(fill)
    f.append(head, bar)
    return f
  }
  if (b.type === 'image') {
    const img = el('img', 'mc-photo')
    img.src = b.src
    img.alt = b.alt ?? ''
    return img
  }
  return null
}

/** Somewhere on the floor, in px: left and right from the window's left edge, top above the floor. */
export interface Area {
  left: number
  right: number
  top: number
}

const TAIL_IN = 18 // the tail stays this far in from a bubble's ends
const CLEAR = 10 // room kept between a bubble and what it avoids

/** Where a bubble `w` wide goes over a head at `x`, `head` px up, keeping clear of `avoid`. */
export function spot(x: number, w: number, head: number, width: number, avoid?: Area): { left: number; rise: number } {
  const centred = x - w / 2
  if (!avoid || head >= avoid.top + CLEAR) return { left: centred, rise: head }
  const overlaps = (l: number) => l < avoid.right + CLEAR && l + w > avoid.left - CLEAR
  if (!overlaps(centred)) return { left: centred, rise: head }
  // Slide to the far side of the mochi, as far as the tail can still reach it.
  const toRight = avoid.left > x
  const left = toRight ? avoid.left - CLEAR - w : avoid.right + CLEAR
  const reaches = x - left >= TAIL_IN && x - left <= w - TAIL_IN
  if (reaches && left >= 12 && left + w <= width - 12) return { left, rise: head }
  return { left: centred, rise: avoid.top + CLEAR * 2 }
}

export function createBubble(stage: HTMLElement) {
  const bubble = el('div', 'mc-bubble')
  const hum = el('div', 'mc-hum')
  const mark = el('div', 'mc-mark')
  stage.append(bubble, hum, mark)

  return {
    /** Say this card: its figures, and the text line it has reached. */
    say(p: Presentation, text: Text | undefined, salience: Salience): void {
      const { title, speaker, palette } = p.context
      bubble.style.setProperty('--tint', palette?.[0] ?? '#e08a9b')
      bubble.dataset.salience = salience
      const parts: HTMLElement[] = []
      const who = [speaker?.name, title].filter(Boolean).join(' · ')
      if (who) parts.push(el('div', 'mc-who', who))
      for (const b of p.blocks) {
        const f = figure(b)
        if (f) parts.push(f)
      }
      if (text) parts.push(line(text))
      bubble.replaceChildren(...parts)
      setLang(bubble, detectLang(p.blocks.map((b) => (b.type === 'text' ? b.text : '')).join('')))
      bubble.classList.remove('is-on')
      void bubble.offsetWidth
      bubble.classList.add('is-on')
    },
    hush(): void {
      bubble.classList.remove('is-on')
    },
    /** The line of what plays, or null. */
    hum(text: string | null): void {
      if (hum.textContent === (text ? `♪ ${text}` : '')) return
      hum.textContent = text ? `♪ ${text}` : ''
      hum.classList.toggle('is-on', !!text)
    },
    mark(m: Mark): void {
      if (mark.textContent !== m) {
        mark.textContent = m
        mark.dataset.mark = m
      }
    },
    /**
     * Hang the bubbles over its head, kept on screen, the tail pointing at it; the mark
     * beside it. Something else on the floor (the practice sheet) is kept clear of:
     * the bubble moves to the other side of the mochi, or, with no room there, rises above it.
     */
    place(x: number, head: number, width: number, side: { x: number; y: number }, avoid?: Area): void {
      for (const b of [bubble, hum]) {
        const w = b.offsetWidth
        const at = spot(x, w, head, width, avoid)
        const left = Math.min(width - w - 12, Math.max(12, at.left))
        const rise = at.rise
        b.style.transform = `translate(${left.toFixed(1)}px, ${(-rise).toFixed(1)}px)`
        b.style.setProperty('--tail', `${Math.min(w - TAIL_IN, Math.max(TAIL_IN, x - left)).toFixed(1)}px`)
      }
      mark.style.transform = `translate(${side.x.toFixed(1)}px, ${(-side.y).toFixed(1)}px)`
    },
  }
}
