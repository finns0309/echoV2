// 风铃 V2 · the wind chime as Claude would draw it. Design notes: ./README.md.
import type { OnAir, Salience } from '@contract'
import { activeBlockIndex, salienceOf } from '@screen/primitives/blocks'
import { createChimePhysics, type ChimePhysics } from '@screen/primitives/chime'
import { watchScale } from '@screen/primitives/scale'
import '@screen/tokens/newsreader.css'
import type { Theme } from '@screen/runtime/theme-api'
import manifest from './manifest'
import { buildChime } from './parts/chime'
import { glassOf } from './parts/glass'
import { paperOf, type PaperContent } from './parts/paper'
import './theme.css'

const MAX_CHARS = manifest.slots.main.maxChars

const same = (a: PaperContent, b: PaperContent) => JSON.stringify(a) === JSON.stringify(b)

export default function createFurinV2(): Theme {
  let root: HTMLElement | null = null
  let chime: ReturnType<typeof buildChime> | null = null
  let physics: ChimePhysics | null = null
  let offSignal: (() => void) | null = null
  let stopScale: (() => void) | null = null

  let onAir: OnAir | null = null
  let shownIndex = -2
  let current: PaperContent = { kind: 'blank' }
  let currentKey = ''
  let flutter = 0
  let lastT = 0

  // A new line is written on the card; the same line again only sends a breath.
  // How loud: quiet writes without a breath of wind, attention rings the bell
  // first. A status updating in place (same key, new numbers) is rewritten where it hangs.
  function write(content: PaperContent, key: string, salience: Salience): void {
    if (salience !== 'quiet') physics?.puff()
    if (same(content, current) || !chime) return
    const inPlace = key === currentKey && content.kind === current.kind && (content.kind === 'value' || content.kind === 'progress')
    current = content
    currentKey = key
    root?.classList.toggle('is-quiet', salience === 'quiet')
    if (inPlace) return chime.rewrite(content, performance.now())
    if (salience === 'attention') strike()
    chime.write(content, performance.now())
  }

  /** Attention: the bell rings on both rims before the card is written, and the seal warms. */
  function strike(): void {
    if (!chime) return
    physics?.onset(0.95, 0.65, performance.now())
    chime.strike({ intensity: 0.9, side: 1, centroid: 0.65 })
    const c = chime
    setTimeout(() => c.strike({ intensity: 0.7, side: -1, centroid: 0.5 }), 160)
    c.glow()
  }

  // Idle: the card is wiped clean. The blank card and its resting spark still read as an object.
  function blank(): void {
    if (current.kind === 'blank') return
    current = { kind: 'blank' }
    currentKey = ''
    chime?.write(current, performance.now())
  }

  return {
    mount(el, ctx) {
      root = el
      el.classList.add('fv')
      // The glass is the season's colour from Claude's palette.
      el.style.setProperty('--fv-glass', glassOf(new Date()).fill)
      // Drawn for the 300×470 hanging window; a filled screen grows the whole chime.
      stopScale = watchScale(el, '--fv-scale')
      chime = buildChime(el)
      const c = chime
      physics = createChimePhysics((e) => c.strike(e))
      offSignal = ctx.onSignal((f) => {
        const now = performance.now()
        if (f.energy !== undefined) physics?.energy(f.energy, now)
        if (f.onset) physics?.onset(f.onset, f.centroid ?? 0.5, now)
      })
      lastT = performance.now()
    },

    unmount() {
      offSignal?.()
      stopScale?.()
      root?.classList.remove('fv')
      root = chime = physics = stopScale = offSignal = null
    },

    show(_slot, next) {
      onAir = next
      shownIndex = -2
    },
    update(_slot, next) {
      onAir = next
      shownIndex = -2
    },
    clear() {
      onAir = null
      blank()
    },
    idle() {
      blank()
    },

    frame(clock) {
      if (!chime || !physics) return
      let dt = (clock.now - lastT) / 1000
      lastT = clock.now
      if (dt <= 0) return
      dt = Math.min(dt, 0.05)

      if (onAir) {
        const i = activeBlockIndex(onAir.presentation, clock.slots.main?.t)
        const block = onAir.presentation.blocks[i]
        if (i !== shownIndex && block) {
          shownIndex = i
          write(paperOf(block, MAX_CHARS), `${onAir.contentId}:${i}`, salienceOf(onAir))
        }
      }

      physics.step(clock.now, dt)
      // High-frequency flutter: the light card shivers with the wind and its own motion.
      const { windMag, paperSpeed } = physics.pose
      flutter += dt * (5 + Math.abs(windMag) * 4)
      const amp = Math.min(4, 0.4 + Math.abs(windMag) * 1.2 + Math.abs(paperSpeed) * 3.5)
      chime.gust(windMag, clock.now)
      chime.render(physics, clock.now, dt, Math.sin(flutter) * amp)
    },
  }
}
