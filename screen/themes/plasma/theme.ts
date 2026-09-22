// 流体 · text floating over a domain-warped fluid. Design notes: ./README.md.
import type { OnAir } from '@contract'
import { activeBlockIndex, toText } from '@screen/primitives/blocks'
import type { Theme } from '@screen/runtime/theme-api'
import { createCards } from './parts/cards'
import { createField } from './parts/field'
import './theme.css'

// Type grows with the window: 1.0 up to this diagonal, then a gentle power curve.
const SCALE_DEADZONE_DIAG = 900
const SCALE_MAX = 3.2

function parseHex(color: string | undefined): [number, number, number] | null {
  const m = color?.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  return m ? [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)] : null
}

export default function createPlasma(): Theme {
  let root: HTMLElement | null = null
  let field: ReturnType<typeof createField> | null = null
  let cards: ReturnType<typeof createCards> | null = null
  let resizeObserver: ResizeObserver | null = null
  let onAir: OnAir | null = null
  let shownIndex = -2

  function updateScale(): void {
    if (!root) return
    const diag = Math.hypot(root.clientWidth, root.clientHeight)
    const scale = diag > SCALE_DEADZONE_DIAG ? Math.min(SCALE_MAX, Math.pow(diag / SCALE_DEADZONE_DIAG, 0.7)) : 1
    root.style.setProperty('--plasma-scale', scale.toFixed(3))
  }

  function take(next: OnAir): void {
    onAir = next
    shownIndex = -2
    field?.setAccent(parseHex(next.presentation.context.palette?.[0]))
  }

  return {
    mount(el) {
      root = el
      el.innerHTML = `<div class="pl-bg"></div><canvas class="pl-field"></canvas><div class="pl-tint"></div><div class="pl-stage"></div>`
      field = createField(el.querySelector<HTMLCanvasElement>('.pl-field')!)
      cards = createCards(el.querySelector<HTMLElement>('.pl-stage')!)
      resizeObserver = new ResizeObserver(updateScale)
      resizeObserver.observe(el)
      updateScale()
    },

    unmount() {
      resizeObserver?.disconnect()
      field?.dispose()
      root = field = cards = resizeObserver = null
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
