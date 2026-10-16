// 风铃 · a hanging glass wind-chime. Design notes: ./README.md.
import type { Block, OnAir, Salience } from '@contract'
import { activeBlockIndex, fitText, progressRatio, salienceOf, valueParts } from '@screen/primitives/blocks'
import { createChimePhysics, type ChimePhysics } from '@screen/primitives/chime'
import { watchScale } from '@screen/primitives/scale'
import { langOf } from '@screen/primitives/text'
import type { Theme } from '@screen/runtime/theme-api'
import manifest from './manifest'
import { buildChime, type PaperContent } from './parts/chime'
import './theme.css'

const MAX_CHARS = manifest.slots.main.maxChars
const FLIP_EDGE_DEG = 86 // the strip is edge-on here: swap the text unseen
const FLIP_RATE = { quiet: 7, normal: 14, attention: 16 } as const // how fast the strip turns over

/** A block as what the strip can carry. */
function paperOf(block: Block): PaperContent {
  const lang = langOf(block)
  const tag = lang ? { lang } : {}
  switch (block.type) {
    case 'text': {
      const text = fitText(block, MAX_CHARS)
      return { kind: 'text', text, ...(block.reading && text === block.text ? { reading: block.reading } : {}), ...tag }
    }
    case 'value': {
      const { label, number, unit, delta } = valueParts(block)
      return { kind: 'value', number, ...(label ? { label } : {}), ...(unit ? { unit } : {}), ...(delta ? { delta: delta.text } : {}), ...tag }
    }
    case 'progress':
      return { kind: 'progress', ratio: progressRatio(block), ...(block.label ? { label: block.label } : {}), ...tag }
    case 'image':
      return { kind: 'image', src: block.src, ...(block.alt ? { alt: block.alt } : {}), ...tag }
  }
}

const same = (a: PaperContent, b: PaperContent) => JSON.stringify(a) === JSON.stringify(b)

export default function createFurin(): Theme {
  let root: HTMLElement | null = null
  let chime: ReturnType<typeof buildChime> | null = null
  let physics: ChimePhysics | null = null
  let offSignal: (() => void) | null = null
  let stopScale: (() => void) | null = null

  let onAir: OnAir | null = null
  let shownIndex = -2
  let current: PaperContent = { kind: 'blank' }
  let currentKey = ''
  let pending: PaperContent | null = null
  let flipRate: number = FLIP_RATE.normal
  let flip = 0
  let flipTarget = 0
  let flutter = 0
  let lastT = 0

  // A new line flips the strip over; the same line again only sends a breath. How
  // loud: quiet turns without a breath of wind, attention strikes the bell first.
  // A status updating in place (same key, new numbers) is rewritten where it hangs.
  function write(content: PaperContent, key: string, salience: Salience): void {
    if (salience !== 'quiet') physics?.puff()
    if (same(content, current)) return
    const inPlace = key === currentKey && content.kind === current.kind && (content.kind === 'value' || content.kind === 'progress')
    current = content
    currentKey = key
    if (inPlace) {
      chime?.write(content)
      return
    }
    if (salience === 'attention') strike()
    flipRate = FLIP_RATE[salience]
    pending = content
    flipTarget = 92
  }

  /** Attention: the bell rings on both rims before the strip turns, and the seal warms. */
  function strike(): void {
    if (!chime) return
    physics?.onset(0.95, 0.65, performance.now())
    chime.strike({ intensity: 0.9, side: 1, centroid: 0.65 })
    const c = chime
    setTimeout(() => c.strike({ intensity: 0.7, side: -1, centroid: 0.5 }), 160)
    c.glow()
  }

  // Idle: flip back to a blank strip. The bare strip and seal still read as an object.
  function blank(): void {
    if (current.kind === 'blank' && !pending) return
    current = { kind: 'blank' }
    currentKey = ''
    flipRate = FLIP_RATE.quiet
    pending = current
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
      // Drawn for the 300×470 hanging window; a filled screen grows the whole chime.
      stopScale = watchScale(el, '--furin-scale')
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
      root = chime = physics = stopScale = null
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
          write(paperOf(block), `${onAir.contentId}:${i}`, salienceOf(onAir))
        }
      }

      physics.step(clock.now, dt)
      flip += (flipTarget - flip) * Math.min(1, flipRate * dt)
      if (pending && flip > FLIP_EDGE_DEG) {
        chime.write(pending)
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
