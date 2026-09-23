// Floating cards at the center: each new block becomes a card that waves in,
// while older cards drift up and blur away. Text reveals per character; a value
// is set as a large number that counts when it changes in place; a progress bar
// is a line of light; a picture floats in. Ported from echo's app.js renderStage().
import type { Block, Salience } from '@contract'
import { progressRatio, valueParts } from '@screen/primitives/blocks'
import { setLang } from '@screen/primitives/text'

const LEAVE_MS = 2200 // matches the CSS leave choreography
const MAX_CARDS = 4
const COUNT_MS = 700

export interface CardMeta {
  /** Same key + same kind of block = the same card, updated in place (a status ticking). */
  key: string
  salience: Salience
  lang?: string
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
const format = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}

/** Per-character spans that wave in, staggered; a lone space survives whitespace collapsing. */
function waveText(text: string, from = 0): HTMLElement[] {
  return [...text].map((ch, i) => {
    const w = el('span', 'w')
    w.style.setProperty('--fd', `${(3.8 + Math.random() * 3.5).toFixed(2)}s`)
    w.style.setProperty('--fdelay', `${(-Math.random() * 6).toFixed(2)}s`)
    w.style.setProperty('--fy', `${(1.4 + Math.random() * 2).toFixed(2)}px`)
    const wi = el('span', 'wi', ch === ' ' ? '\u00a0' : ch)
    wi.style.setProperty('--i', String(from + i))
    w.appendChild(wi)
    return w
  })
}

export function createCards(stage: HTMLElement) {
  let current: { card: HTMLElement; key: string; block: Block } | null = null
  let counting = 0

  function leaveAll(): void {
    for (const c of stage.querySelectorAll('.stage-card:not(.leaving)')) {
      c.classList.add('leaving')
      setTimeout(() => c.remove(), LEAVE_MS + 200)
    }
    while (stage.children.length > MAX_CARDS) stage.firstElementChild?.remove()
    current = null
  }

  /** Tween a number element from one value to another; the latest call wins. */
  function countTo(node: HTMLElement, from: number, to: number, text: (n: number) => string): void {
    const id = ++counting
    const start = performance.now()
    const tick = (now: number) => {
      if (id !== counting) return
      const t = Math.min(1, (now - start) / COUNT_MS)
      node.textContent = text(from + (to - from) * easeOut(t))
      if (t < 1) requestAnimationFrame(tick)
      else node.textContent = text(to)
    }
    requestAnimationFrame(tick)
  }

  function textCard(block: Extract<Block, { type: 'text' }>): HTMLElement {
    const card = el('div', 'stage-card stage-text')
    card.append(...waveText(block.text))
    if (block.reading) card.appendChild(el('div', 'stage-reading', block.reading))
    return card
  }

  function valueCard(block: Extract<Block, { type: 'value' }>): HTMLElement {
    const { label, number, unit, delta } = valueParts(block)
    const card = el('div', 'stage-card stage-value')
    if (label) card.appendChild(el('div', 'sv-label', label))
    const line = el('div', 'sv-line')
    line.append(el('span', 'sv-num', number))
    if (unit) line.append(el('span', 'sv-unit', unit))
    if (delta) line.append(el('span', `sv-delta ${delta.dir}`, delta.text))
    card.appendChild(line)
    return card
  }

  function progressCard(block: Extract<Block, { type: 'progress' }>): HTMLElement {
    const card = el('div', 'stage-card stage-progress')
    const head = el('div', 'sp-head')
    if (block.label) head.append(el('span', 'sp-label', block.label))
    head.append(el('span', 'sp-pct', `${Math.round(progressRatio(block) * 100)}%`))
    const track = el('div', 'sp-track')
    const fill = el('div', 'sp-fill')
    track.appendChild(fill)
    card.append(head, track)
    // Grow from empty on entrance; later updates slide from where it was.
    requestAnimationFrame(() => fill.style.setProperty('--p', progressRatio(block).toFixed(4)))
    return card
  }

  function imageCard(block: Extract<Block, { type: 'image' }>): HTMLElement {
    const card = el('div', 'stage-card stage-image')
    const img = el('img', 'si-img')
    img.src = block.src
    img.alt = block.alt ?? ''
    img.decoding = 'async'
    card.appendChild(img)
    if (block.alt) card.appendChild(el('div', 'si-cap', block.alt))
    return card
  }

  /** The same status, new numbers: move what's there instead of a new entrance. */
  function updateInPlace(block: Block): boolean {
    if (!current || current.block.type !== block.type) return false
    const { card } = current
    if (block.type === 'value' && current.block.type === 'value') {
      const next = valueCard(block)
      const from = current.block.value
      card.replaceChildren(...next.childNodes)
      const fresh = card.querySelector<HTMLElement>('.sv-num')
      if (fresh && typeof from === 'number' && typeof block.value === 'number' && from !== block.value) {
        countTo(fresh, from, block.value, (n) => format.format(n))
        card.classList.remove('bump')
        void card.offsetWidth
        card.classList.add('bump')
      }
    } else if (block.type === 'progress' && current.block.type === 'progress') {
      const fill = card.querySelector<HTMLElement>('.sp-fill')
      const pct = card.querySelector<HTMLElement>('.sp-pct')
      const from = progressRatio(current.block) * 100
      const to = progressRatio(block) * 100
      fill?.style.setProperty('--p', (to / 100).toFixed(4))
      if (pct) countTo(pct, from, to, (n) => `${Math.round(n)}%`)
      const label = card.querySelector<HTMLElement>('.sp-label')
      if (label && block.label) label.textContent = block.label
    } else return false
    current.block = block
    return true
  }

  return {
    /** Show a block. Returns false when it only updated the card already there. */
    show(block: Block, meta: CardMeta): boolean {
      if (current?.key === meta.key && updateInPlace(block)) return false
      leaveAll()
      const card =
        block.type === 'text'
          ? textCard(block)
          : block.type === 'value'
            ? valueCard(block)
            : block.type === 'progress'
              ? progressCard(block)
              : imageCard(block)
      card.dataset.salience = meta.salience
      setLang(card, meta.lang)
      stage.appendChild(card)
      current = { card, key: meta.key, block }
      return true
    },

    clear(): void {
      leaveAll()
    },
  }
}
