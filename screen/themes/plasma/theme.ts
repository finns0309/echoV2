// 流体 · text floating over a domain-warped fluid. Design notes: ./README.md.
import type { OnAir } from '@contract'
import { activeBlockIndex, toText } from '@screen/primitives/blocks'
import { hexToRgb } from '@screen/primitives/color'
import { watchScale } from '@screen/primitives/scale'
import type { Theme } from '@screen/runtime/theme-api'
import { createCards } from './parts/cards'
import { createField } from './parts/field'
import './theme.css'

export default function createPlasma(): Theme {
  let field: ReturnType<typeof createField> | null = null
  let cards: ReturnType<typeof createCards> | null = null
  let stopScale: (() => void) | null = null
  let onAir: OnAir | null = null
  let shownIndex = -2

  function take(next: OnAir): void {
    onAir = next
    shownIndex = -2
    field?.setAccent(hexToRgb(next.presentation.context.palette?.[0]))
  }

  return {
    mount(el) {
      el.innerHTML = `<div class="pl-bg"></div><canvas class="pl-field"></canvas><div class="pl-tint"></div><div class="pl-stage"></div>`
      field = createField(el.querySelector<HTMLCanvasElement>('.pl-field')!)
      cards = createCards(el.querySelector<HTMLElement>('.pl-stage')!)
      // Type grows with the window.
      stopScale = watchScale(el, '--plasma-scale')
    },

    unmount() {
      stopScale?.()
      field?.dispose()
      field = cards = stopScale = null
    },

    show(_slot, next) {
      take(next)
    },
    update(_slot, next) {
      take(next)
    },
    clear() {
      onAir = null
      cards?.clear()
    },
    // Idle is just the fluid: nothing to say, nothing floating.
    idle() {
      cards?.clear()
    },

    frame(clock) {
      if (onAir && cards) {
        const i = activeBlockIndex(onAir.presentation, clock.slots.main?.t)
        const block = onAir.presentation.blocks[i]
        if (i !== shownIndex && block) {
          shownIndex = i
          cards.show(toText(block), block.type === 'text' ? block.reading : undefined)
          field?.pulse()
        }
      }
      field?.frame(clock.now)
    },
  }
}
