// もち · a mochi living along the bottom of the screen. Design notes: ./README.md.
import type { Block, OnAir } from '@contract'
import { activeBlockIndex, salienceOf } from '@screen/primitives/blocks'
import type { Theme } from '@screen/runtime/theme-api'
import { createBody } from './parts/body'
import { createBubble } from './parts/bubble'
import { createMochi, type World } from './parts/motion'
import './theme.css'

type Text = Extract<Block, { type: 'text' }>

const FLOOR = 10 // px above the window's bottom edge
const BODY = 62 // the body's height at rest, in drawing units
const SIDE = 50 // and its half-width
const GAP = 26 // between its head and a bubble
const DRAWING = 200 // the body's drawing is this wide, in its own units

/** How big it is drawn: a little bigger on a bigger screen. */
const sizeFor = (height: number) => Math.min(1.6, Math.max(0.85, height / 950))
const isNight = (d: Date) => d.getHours() >= 23 || d.getHours() < 6

export default function createMochiTheme(): Theme {
  let root: HTMLElement | null = null
  let body: ReturnType<typeof createBody> | null = null
  let bubble: ReturnType<typeof createBubble> | null = null
  let mochi: ReturnType<typeof createMochi> | null = null
  let offSignal: (() => void) | null = null
  let card: OnAir | null = null
  let media: OnAir | null = null
  let energy = 0
  let last = 0
  let said = ''
  let hummed = -2

  return {
    mount(el, ctx) {
      root = el
      el.classList.add('mc')
      const stage = document.createElement('div')
      stage.className = 'mc-stage'
      el.append(stage)
      body = createBody(stage)
      bubble = createBubble(stage)
      mochi = createMochi(el.clientWidth * (0.3 + Math.random() * 0.4))
      offSignal = ctx.onSignal((f) => {
        if (f.energy !== undefined) energy = energy * 0.7 + f.energy * 0.3
        if (f.onset) mochi?.beat(f.onset)
      })
    },

    unmount() {
      offSignal?.()
      root?.classList.remove('mc')
      root = body = bubble = mochi = offSignal = null
    },

    show(slot, next) {
      if (slot === 'media') {
        media = next
        hummed = -2
        return
      }
      card = next
      said = ''
      mochi?.notice(salienceOf(next) === 'attention')
    },
    update(slot, next) {
      if (slot === 'media') media = next
      else {
        card = next
        said = '' // same card, new data: say it again as it now is
      }
    },
    clear(slot) {
      if (slot === 'media') {
        media = null
        bubble?.hum(null)
      } else {
        card = null
        bubble?.hush()
      }
    },

    frame(clock) {
      if (!root || !mochi || !body || !bubble) return
      const dt = last ? Math.min(0.05, (clock.now - last) / 1000) : 0
      last = clock.now
      const width = root.clientWidth
      const world: World = { width, talking: !!card, playing: !!media, energy, night: isNight(new Date()) }
      const pose = mochi.step(dt, world)
      energy *= 0.98

      // Where it stands, and how big.
      const size = sizeFor(root.clientHeight)
      body.draw(pose)
      body.svg.style.width = `${DRAWING * size}px`
      body.svg.style.transform = `translate(${(pose.x - (DRAWING / 2) * size).toFixed(1)}px, ${-FLOOR}px)`

      // What it says: the card's figures and the text line it has reached.
      if (card) {
        const t = clock.slots.card?.t
        const now = t ?? Infinity
        const texts = card.presentation.blocks.filter((b): b is Text => b.type === 'text' && (b.at ?? 0) <= now)
        const text = texts.at(-1)
        const key = `${card.contentId}:${texts.length}:${JSON.stringify(card.presentation.blocks.filter((b) => b.type !== 'text'))}`
        if (key !== said) {
          said = key
          bubble.say(card.presentation, text, salienceOf(card))
          mochi.speak()
        }
      }
      // What plays, it hums, when it isn't talking.
      if (media) {
        const i = activeBlockIndex(media.presentation, clock.slots.media?.t)
        if (i !== hummed || card) {
          hummed = i
          const b = media.presentation.blocks[i]
          bubble.hum(!card && b?.type === 'text' ? b.text : null)
        }
      }
      bubble.mark(pose.mark)
      const top = (BODY * (1 - pose.squash) + pose.lift) * size + FLOOR
      bubble.place(pose.x, top + GAP * size, width, { x: pose.x + (SIDE * (1 + pose.squash) + 6) * size, y: top * 0.8 })
    },
  }
}
