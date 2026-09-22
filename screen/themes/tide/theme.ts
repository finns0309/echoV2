// 夜潮 · text written in light, carried away by waves. Design notes: ./README.md.
import type { Block, OnAir, Presentation } from '@contract'
import { toText } from '@screen/primitives/blocks'
import { timedUnits } from '@screen/primitives/text'
import type { Theme } from '@screen/runtime/theme-api'
import { createTideEngine } from './parts/engine'
import type { TimedLine } from './parts/waves'
import './theme.css'

function parseHex(color: string | undefined): [number, number, number] | null {
  const m = color?.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  return m ? [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)] : null
}

/** Every block becomes a timed line; non-text blocks read as text and start at 0. */
function linesOf(p: Presentation): TimedLine[] {
  const textual: Block[] = p.blocks
    .map((b): Block => (b.type === 'text' ? b : { type: 'text', role: b.role, text: toText(b) || ' ' }))
    .filter((b) => b.type === 'text' && b.text.trim())
  return textual.map((b, i) => {
    const next = textual[i + 1]
    const nextAt = next?.type === 'text' ? next.at : undefined
    return {
      time: b.type === 'text' ? (b.at ?? 0) : 0,
      text: b.type === 'text' ? b.text : '',
      units: timedUnits(b, nextAt),
    }
  })
}

const signature = (p: Presentation) => JSON.stringify(p.blocks)

export default function createTide(): Theme {
  let engine: ReturnType<typeof createTideEngine> | null = null
  let offSignal: (() => void) | null = null
  let shownSignature = ''
  let shownAt = 0

  function take(onAir: OnAir, fresh: boolean): void {
    if (!engine) return
    engine.setAccent(parseHex(onAir.presentation.context.palette?.[0]))
    const sig = signature(onAir.presentation)
    if (!fresh && sig === shownSignature) return // only the clock moved
    shownSignature = sig
    shownAt = performance.now()
    engine.setLines(linesOf(onAir.presentation))
  }

  return {
    mount(el, ctx) {
      engine = createTideEngine(el)
      offSignal = ctx.onSignal((f) => {
        if (f.energy !== undefined) engine?.energy(f.energy)
        if (f.onset) engine?.onset(f.onset)
      })
    },
    unmount() {
      offSignal?.()
      engine?.dispose()
      engine = offSignal = null
    },

    show(_slot, next) {
      take(next, true)
    },
    update(_slot, next) {
      take(next, false)
    },
    clear() {
      shownSignature = ''
      engine?.clear()
    },
    idle() {
      shownSignature = ''
      engine?.clear()
    },

    frame(clock) {
      // Untimed content (a status) keeps its own clock from the moment it appeared.
      const t = clock.slots.main?.t ?? (performance.now() - shownAt) / 1000
      engine?.frame(clock.now, t)
    },
  }
}
