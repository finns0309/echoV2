// 风铃 · a hanging glass wind-chime. Design notes: ./README.md.
import type { OnAir } from '@contract'
import { activeBlockIndex, fitText } from '@screen/primitives/blocks'
import type { Theme } from '@screen/runtime/theme-api'
import manifest from './manifest'
import { buildChime } from './parts/chime'
import { createChimePhysics, type ChimePhysics } from './parts/physics'
import './theme.css'

const MAX_CHARS = manifest.slots.main.maxChars
const FLIP_EDGE_DEG = 86 // the strip is edge-on here: swap the text unseen

export default function createFurin(): Theme {
  let root: HTMLElement | null = null
  let chime: ReturnType<typeof buildChime> | null = null
  let physics: ChimePhysics | null = null
  let offSignal: (() => void) | null = null

  let onAir: OnAir | null = null
  let shownIndex = -2
  let currentText = ''
  let pending: { text: string; reading?: string } | null = null
  let flip = 0
  let flipTarget = 0
  let flutter = 0
  let lastT = 0

  // A new line flips the strip over; the same line again only sends a breath.
  function write(text: string, reading?: string): void {
    physics?.puff()
    if (text === currentText) return
    currentText = text
    pending = { text, ...(reading ? { reading } : {}) }
    flipTarget = 92
  }

  // Idle: flip back to a blank strip. The bare strip and seal still read as an object.
  function blank(): void {
    if (!currentText && !pending) return
    currentText = ''
    pending = { text: '' }
    flipTarget = 92
  }

  function take(next: OnAir): void {
    onAir = next
    shownIndex = -2
    const accent = next.presentation.context.palette?.[0]
    if (accent) root?.style.setProperty('--furin-accent', accent)
    else root?.style.removeProperty('--furin-accent')
  }

  return {
    mount(el, ctx) {
      root = el
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
      root = chime = physics = null
    },

    show(_slot, next) {
      take(next)
    },
    update(_slot, next) {
      take(next)
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
          const text = fitText(block, MAX_CHARS)
          const reading = block.type === 'text' && text === block.text ? block.reading : undefined
          write(text, reading)
        }
      }

      physics.step(clock.now, dt)
      flip += (flipTarget - flip) * Math.min(1, 14 * dt)
      if (pending && flip > FLIP_EDGE_DEG) {
        chime.write(pending.text, pending.reading)
        pending = null
        flipTarget = 0
      }
      // High-frequency flutter: the light strip shivers with the wind and its own motion.
      const { windMag, paperSpeed } = physics.pose
      flutter += dt * (5 + Math.abs(windMag) * 4)
      const amp = Math.min(5, 0.5 + Math.abs(windMag) * 1.4 + Math.abs(paperSpeed) * 4)
      chime.render(physics, flip, Math.sin(flutter) * amp)
    },
  }
}
