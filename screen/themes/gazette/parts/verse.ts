// The literary box (文芸欄): whatever is playing, set as a poem being printed.
// The title and author head the box, the cover is a halftone, and each line is
// set as it comes, the two before it fading back into grey ink above it.
import type { OnAir } from '@contract'
import { activeBlockIndex } from '@screen/primitives/blocks'
import { detectLang, setLang } from '@screen/primitives/text'
import { photo } from './story'

const KEPT = 2 // earlier lines still on the page

function el(tag: string, cls: string, text?: string): HTMLElement {
  const e = document.createElement(tag)
  e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}

export function createVerse(box: HTMLElement) {
  let onAir: OnAir | null = null
  let shown = -2
  let resting = false
  let lines: HTMLElement | null = null

  function head(next: OnAir): void {
    const { title, byline, speaker, art } = next.presentation.context
    const top = el('header', 'gz-verse-head')
    if (art) top.append(photo(art))
    const names = el('div', 'gz-verse-names')
    names.append(el('div', 'gz-kicker', '文芸'))
    if (title) names.append(el('div', 'gz-verse-title', `「${title}」`))
    const author = byline ?? speaker?.name
    if (author) names.append(el('div', 'gz-verse-by', author))
    top.append(names)
    lines = el('div', 'gz-verse-lines')
    box.replaceChildren(top, lines)
    setLang(box, detectLang(next.presentation.blocks.map((b) => (b.type === 'text' ? b.text : '')).join('')))
  }

  /** Between lines the player may be in an instrumental break. */
  function inBreak(next: OnAir, t: number | undefined): boolean {
    return t !== undefined && (next.presentation.hints?.breaks ?? []).some((b) => t >= b.at && t < b.until)
  }

  function set(i: number, rest: boolean): void {
    if (!lines || !onAir) return
    const texts = onAir.presentation.blocks.map((b) => (b.type === 'text' ? b.text : ''))
    const kept = texts.slice(Math.max(0, i - KEPT), Math.max(0, i)).map((t) => el('p', 'gz-verse-past', t))
    const now = rest ? el('p', 'gz-verse-now gz-verse-rest', '〜 間奏 〜') : i >= 0 && texts[i] ? el('p', 'gz-verse-now', texts[i]) : null
    lines.replaceChildren(...kept, ...(now ? [now] : []))
  }

  return {
    show(next: OnAir): void {
      const same = onAir?.contentId === next.contentId
      onAir = next
      if (!same) {
        shown = -2
        head(next)
      }
    },
    clear(): void {
      onAir = null
      lines = null
      box.replaceChildren()
    },
    frame(t: number | undefined): void {
      if (!onAir) return
      const i = activeBlockIndex(onAir.presentation, t)
      const rest = inBreak(onAir, t)
      if (i === shown && rest === resting) return
      shown = i
      resting = rest
      set(i, rest)
    },
  }
}
