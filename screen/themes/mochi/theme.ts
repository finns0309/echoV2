// もち · a mochi living along the bottom of the screen. Design notes: ./README.md.
import type { Block, OnAir } from '@contract'
import { activeBlockIndex, salienceOf } from '@screen/primitives/blocks'
import type { Theme } from '@screen/runtime/theme-api'
import { createBoard } from './parts/board'
import { createBody } from './parts/body'
import { createBubble, type Area } from './parts/bubble'
import { flavorFor } from './parts/flavor'
import { createMochi, type World } from './parts/motion'
import { strokesOf, wordOf } from './parts/strokes'
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
  /** A word card: fetch its strokes and write it on the sheet, if it is still on by then. */
  async function write(next: OnAir): Promise<void> {
    board?.clear()
    sheet = 0
    const word = wordOf(next.presentation.blocks)
    if (!word) return
    const chars = [...word]
    const strokes = await Promise.all(chars.map(strokesOf))
    if (card?.contentId !== next.contentId || strokes.some((s) => !s)) return
    board?.write(chars, strokes as string[][])
    sheet = 1
  }

  let root: HTMLElement | null = null
  let body: ReturnType<typeof createBody> | null = null
  let bubble: ReturnType<typeof createBubble> | null = null
  let board: ReturnType<typeof createBoard> | null = null
  /** Which side its practice sheet is on while it writes, else 0. */
  let sheet = 0
  let mochi: ReturnType<typeof createMochi> | null = null
  let offSignal: (() => void) | null = null
  let card: OnAir | null = null
  let media: OnAir | null = null
  let energy = 0
  let last = 0
  let said = ''
  let hummed = -2
  let flavor = ''

  return {
    mount(el, ctx) {
      root = el
      el.classList.add('mc')
      const stage = document.createElement('div')
      stage.className = 'mc-stage'
      el.append(stage)
      body = createBody(stage)
      bubble = createBubble(stage)
      board = createBoard(stage)
      mochi = createMochi(el.clientWidth * (0.3 + Math.random() * 0.4))
      offSignal = ctx.onSignal((f) => {
        if (f.energy !== undefined) energy = energy * 0.7 + f.energy * 0.3
        if (f.onset) mochi?.beat(f.onset)
      })
    },

    unmount() {
      offSignal?.()
      root?.classList.remove('mc')
      root = body = bubble = board = mochi = offSignal = null
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
      write(next)
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
        board?.clear()
        sheet = 0
      }
    },

    frame(clock) {
      if (!root || !mochi || !body || !bubble) return
      const dt = last ? Math.min(0.05, (clock.now - last) / 1000) : 0
      last = clock.now
      const width = root.clientWidth
      const world: World = { width, talking: !!card, playing: !!media, energy, night: isNight(new Date()), ...(sheet ? { lookAt: sheet * 0.7 } : {}) }
      const pose = mochi.step(dt, world)
      // Today's wagashi; it changes at midnight.
      const today = flavorFor(new Date())
      if (today.id !== flavor) {
        flavor = today.id
        body.setFlavor(today)
      }
      energy *= 0.98

      // Where it stands, and how big.
      const size = sizeFor(root.clientHeight)
      body.draw(pose)
      body.svg.style.width = `${DRAWING * size}px`
      root.style.setProperty('--mc-size', size.toFixed(3))
      let area: Area | undefined
      if (sheet && board) {
        const at = board.place(pose.x, (SIDE * (1 + pose.squash) + 14) * size, width, FLOOR)
        sheet = at.side
        area = at.area
      }
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
      bubble.place(pose.x, top + GAP * size, width, { x: pose.x + (SIDE * (1 + pose.squash) + 6) * size, y: top * 0.8 }, area)
    },
  }
}
