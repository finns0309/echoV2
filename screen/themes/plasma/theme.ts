// 流体 · text floating over a domain-warped fluid. Design notes: ./README.md.
import type { OnAir } from '@contract'
import { activeBlockIndex, salienceOf } from '@screen/primitives/blocks'
import { hexToRgb } from '@screen/primitives/color'
import { watchScale } from '@screen/primitives/scale'
import { langOf } from '@screen/primitives/text'
import type { Theme } from '@screen/runtime/theme-api'
import { createCards } from './parts/cards'
import { createField } from './parts/field'
import './theme.css'

// How hard a new card stirs the fluid.
const PULSE = { quiet: 0.15, normal: 0.65, attention: 1 } as const

export default function createPlasma(): Theme {
  let root: HTMLElement | null = null
  let flare: HTMLElement | null = null
  let field: ReturnType<typeof createField> | null = null
  let cards: ReturnType<typeof createCards> | null = null
  let stopScale: (() => void) | null = null
  let onAir: OnAir | null = null
  let shownIndex = -2

  function take(next: OnAir): void {
    onAir = next
    shownIndex = -2
    const accent = next.presentation.context.palette?.[0]
    field?.setAccent(hexToRgb(accent))
    if (accent) root?.style.setProperty('--plasma-accent', accent)
    else root?.style.removeProperty('--plasma-accent')
  }

  /** Attention: a wash of the accent across the fluid, once. */
  function flash(): void {
    if (!flare) return
    flare.classList.remove('on')
    void flare.offsetWidth
    flare.classList.add('on')
  }

  return {
    mount(el) {
      root = el
      el.innerHTML = `<div class="pl-bg"></div><canvas class="pl-field"></canvas><div class="pl-flare"></div><div class="pl-tint"></div><div class="pl-stage"></div>`
      flare = el.querySelector<HTMLElement>('.pl-flare')
      field = createField(el.querySelector<HTMLCanvasElement>('.pl-field')!)
      cards = createCards(el.querySelector<HTMLElement>('.pl-stage')!)
      // Type grows with the window.
      stopScale = watchScale(el, '--plasma-scale')
    },

    unmount() {
      stopScale?.()
      field?.dispose()
      field = cards = stopScale = root = flare = null
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
          const salience = salienceOf(onAir)
          const fresh = cards.show(block, { key: `${onAir.contentId}:${i}`, salience, lang: langOf(block) })
          if (fresh) {
            field?.pulse(PULSE[salience])
            if (salience === 'attention') flash()
          }
        }
      }
      field?.frame(clock.now)
    },
  }
}
