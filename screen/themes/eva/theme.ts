// 新世纪 · hard-cut Mincho title cards on a black void. Design notes: ./README.md.
import type { OnAir } from '@contract'
import { activeBlockIndex, progressRatio, salienceOf, valueParts } from '@screen/primitives/blocks'
import { langOf } from '@screen/primitives/text'
import type { Theme } from '@screen/runtime/theme-api'
import { directionsOf } from './grammar'
import { createCard } from './parts/layout'
import './theme.css'

export default function createEva(): Theme {
  let card: ReturnType<typeof createCard> | null = null
  let onAir: OnAir | null = null
  let shownIndex = -2
  let shown = '' // what the card shows, so a repeated line holds and a changed status recuts

  return {
    mount(el) {
      const cardEl = document.createElement('div')
      cardEl.className = 'ev-card'
      el.appendChild(cardEl)
      card = createCard(cardEl)
      card.idle()
    },
    unmount() {
      card = null
    },

    // New content = hard cut to 待機; its first block replaces it.
    show(_slot, next) {
      onAir = next
      shownIndex = -2
      shown = ''
      card?.idle()
    },
    // Late directions only upgrade the cards that haven't been cut to yet.
    update(_slot, next) {
      onAir = next
    },
    clear() {
      onAir = null
      shown = ''
      card?.idle()
    },
    idle() {
      shown = ''
      card?.idle()
    },

    frame(clock) {
      if (!onAir || !card) return
      const i = activeBlockIndex(onAir.presentation, clock.slots.main?.t)
      const block = onAir.presentation.blocks[i]
      if (!block) return
      // Text changes with the index; a status changes in place, so compare what would show.
      const signature = block.type === 'text' ? block.text.trim() : JSON.stringify(block)
      if (i === shownIndex && signature === shown) return
      shownIndex = i
      if (!signature || signature === shown) return // a repeated line holds its card
      shown = signature
      const salience = salienceOf(onAir)
      const lang = langOf(block)
      switch (block.type) {
        case 'text':
          card.render(signature, directionsOf(onAir.directions)?.cards[i] ?? null, block.emphasis, salience, lang)
          break
        case 'value':
          card.renderValue(valueParts(block), salience, lang)
          break
        case 'progress':
          card.renderProgress(block.label, progressRatio(block), block.value, block.max, salience, lang)
          break
        case 'image':
          card.renderImage(block.src, block.alt, salience, lang)
      }
    },
  }
}
