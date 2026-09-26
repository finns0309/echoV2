// 流萤 · a swarm of fireflies over the screen that gathers to spell what arrives.
// Design notes: ./README.md.
import type { OnAir } from '@contract'
import { activeBlockIndex, salienceOf } from '@screen/primitives/blocks'
import { hexToRgb } from '@screen/primitives/color'
import type { Theme } from '@screen/runtime/theme-api'
import { linesOf, type Line } from './parts/glyphs'
import { spell } from './parts/letters'
import { createSky } from './parts/sky'
import { createSwarm } from './parts/swarm'
import './theme.css'

const isNight = (d: Date) => d.getHours() >= 19 || d.getHours() < 5
/** Bigger fireflies on a bigger screen. */
const sizeFor = (height: number) => Math.min(1.5, Math.max(0.9, height / 900))

export default function createFireflyTheme(): Theme {
  let root: HTMLElement | null = null
  let sky: ReturnType<typeof createSky> | null = null
  let swarm: ReturnType<typeof createSwarm> | null = null
  let offSignal: (() => void) | null = null
  let card: OnAir | null = null
  let media: OnAir | null = null
  let energy = 0
  let last = 0
  /** What they spell now, so it is formed once. */
  let spelt = ''
  let hurry = false

  return {
    mount(el, ctx) {
      root = el
      el.classList.add('ff')
      sky = createSky(el)
      swarm = createSwarm(el.clientWidth || 1200, el.clientHeight || 800)
      offSignal = ctx.onSignal((f) => {
        if (f.energy !== undefined) energy = energy * 0.7 + f.energy * 0.3
        if (f.onset) swarm?.beat(f.onset)
      })
    },

    unmount() {
      offSignal?.()
      sky?.remove()
      root?.classList.remove('ff')
      root = sky = swarm = offSignal = null
    },

    show(slot, next) {
      if (slot === 'media') media = next
      else {
        card = next
        hurry = salienceOf(next) === 'attention'
      }
      spelt = ''
    },
    update(slot, next) {
      if (slot === 'media') media = next
      else card = next
    },
    clear(slot) {
      if (slot === 'media') media = null
      else card = null
    },
    idle() {
      card = media = null
    },

    frame(clock) {
      if (!root || !swarm || !sky) return
      const dt = last ? Math.min(0.05, (clock.now - last) / 1000) : 0
      last = clock.now
      const width = root.clientWidth
      const height = root.clientHeight

      // What to spell: the card's line, else the line of what plays, softer.
      let lines: Line[] = []
      let id = ''
      let tint: readonly [number, number, number] | undefined
      let lum = 1
      if (card) {
        lines = linesOf(card.presentation.blocks, clock.slots.card?.t ?? Infinity)
        id = card.contentId
        tint = hexToRgb(card.presentation.context.palette?.[0]) ?? undefined
        if (salienceOf(card) === 'quiet') lum = 0.6
      } else if (media) {
        const b = media.presentation.blocks[activeBlockIndex(media.presentation, clock.slots.media?.t)]
        if (b?.type === 'text') lines = [{ text: b.text, scale: 0.7, lum: 0.75 }]
        id = media.contentId
      }
      const key = `${id}:${JSON.stringify(lines)}:${width}x${height}`
      if (key !== spelt) {
        spelt = key
        if (lines.length) {
          // Where the swarm is, kept to the upper middle of the screen.
          const c = swarm.centre
          const targets = spell(lines, c.x, Math.min(height * 0.6, Math.max(height * 0.25, c.y)), width, height).map((p) => ({ ...p, lum: p.lum * lum, ...(tint ? { tint } : {}) }))
          swarm.form(targets, width, height, hurry)
          hurry = false
        } else swarm.release()
      }

      swarm.step(dt, { width, height, night: isNight(new Date()), energy, busy: !!(card || media) })
      energy *= 0.98
      sky.draw(swarm.flies, width, height, sizeFor(height))
    },
  }
}
