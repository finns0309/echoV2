// 夜潮 · text written in light, carried away by waves. Design notes: ./README.md.
import type { Block, OnAir, Presentation } from '@contract'
import { progressRatio, salienceOf, toText, valueParts } from '@screen/primitives/blocks'
import { hexToRgb } from '@screen/primitives/color'
import { langOf, timedUnits } from '@screen/primitives/text'
import type { Theme } from '@screen/runtime/theme-api'
import { createTideEngine } from './parts/engine'
import type { TimedLine } from './parts/waves'
import './theme.css'

/** A status as tide sets it: its label and its figure as two phrases (a space is a row break here). */
function statusText(b: Block): string {
  if (b.type === 'value') {
    const { label, number, unit, delta } = valueParts(b)
    return [label, `${number}${unit ?? ''}${delta ? delta.text : ''}`].filter(Boolean).join(' ')
  }
  if (b.type === 'progress') return [b.label, `${Math.round(progressRatio(b) * 100)}%`].filter(Boolean).join(' ')
  return toText(b)
}

/**
 * Every block becomes a timed line; non-text blocks read as text and start at 0.
 * A progress block keeps its ratio, for the line of light under its text.
 */
function linesOf(p: Presentation): TimedLine[] {
  // Untimed content is a status: it stays until it is taken off.
  const hold = p.timeline.kind === 'none'
  type TextBlock = Extract<Block, { type: 'text' }>
  const asText = (b: Block): TextBlock => (b.type === 'text' ? b : { type: 'text', role: b.role, text: statusText(b) || ' ' })
  const textual = p.blocks.map((b) => ({ source: b, text: asText(b) })).filter(({ text }) => text.text.trim())
  return textual.map(({ source, text: b }, i) => {
    const lang = langOf(source)
    return {
      time: b.at ?? 0,
      text: b.text,
      units: timedUnits(b, textual[i + 1]?.text.at),
      ...(lang ? { lang } : {}),
      ...(source.type === 'progress' ? { bar: progressRatio(source) } : {}),
      ...(hold ? { hold } : {}),
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
    engine.setAccent(hexToRgb(onAir.presentation.context.palette?.[0]))
    engine.setLoudness(salienceOf(onAir))
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
