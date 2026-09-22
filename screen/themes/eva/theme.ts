// 新世纪 · hard-cut Mincho title cards on a black void. Design notes: ./README.md.
import type { OnAir } from '@contract'
import { activeBlockIndex, toText } from '@screen/primitives/blocks'
import type { Theme } from '@screen/runtime/theme-api'
import { directionsOf } from './grammar'
import { createCard } from './parts/layout'
import './theme.css'

export default function createEva(): Theme {
  let card: ReturnType<typeof createCard> | null = null
  let onAir: OnAir | null = null
  let shownIndex = -2
  let shownText = ''

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
      shownText = ''
      card?.idle()
    },
    // Late directions only upgrade the cards that haven't been cut to yet.
    update(_slot, next) {
      onAir = next
    },
    clear() {
      onAir = null
      shownText = ''
      card?.idle()
    },
    idle() {
      shownText = ''
      card?.idle()
    },

    frame(clock) {
      if (!onAir || !card) return
      const i = activeBlockIndex(onAir.presentation, clock.slots.main?.t)
      const block = onAir.presentation.blocks[i]
      if (i === shownIndex || !block) return
      shownIndex = i
      const text = toText(block).trim()
      if (!text || text === shownText) return // a repeated line holds its card
      shownText = text
      const direction = directionsOf(onAir.directions)?.cards[i] ?? null
      card.render(text, direction, block.type === 'text' ? block.emphasis : undefined)
    },
  }
}
