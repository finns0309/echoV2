// Duo · a foldable phone standing on the desk. Design notes: ./README.md.
import type { OnAir } from '@contract'
import { activeBlockIndex, salienceOf } from '@screen/primitives/blocks'
import type { Theme } from '@screen/runtime/theme-api'
import { summarize } from './parts/card'
import { createCover } from './parts/cover'
import { createInside } from './parts/inside'
import { createIsland } from './parts/island'
import { createPhone, type Phone } from './parts/phone'
import './theme.css'

export default function createDuo(): Theme {
  let root: HTMLElement | null = null
  let phone: Phone | null = null
  let cover: ReturnType<typeof createCover> | null = null
  let inside: ReturnType<typeof createInside> | null = null
  let island: ReturnType<typeof createIsland> | null = null
  let ticker: ReturnType<typeof setInterval> | undefined
  let card: OnAir | null = null
  let media: OnAir | null = null
  /** Opened by a tap; urgent news opens it too while it is on. */
  let opened = false
  let shownLine = -2
  let resting = false

  function fold(): void {
    phone?.setOpen(opened || (!!card && salienceOf(card) === 'attention'))
    cover?.idle(!card && !media)
  }
  function tick(): void {
    const now = new Date()
    cover?.tick(now)
    inside?.tick(now)
  }
  function play(next: OnAir | null): void {
    media = next
    shownLine = -2
    cover?.playing(next)
    inside?.playing(next)
    if (!next) cover?.line(null)
    fold()
  }

  return {
    mount(el) {
      root = el
      el.classList.add('du')
      phone = createPhone(el)
      cover = createCover(phone.cover)
      island = createIsland(phone.cover)
      // Messages on the left, the player on the right, as Apple shows Split View.
      inside = createInside(phone.right, phone.left)
      // A tap folds or opens it, as a hand would.
      phone.device.addEventListener('click', () => {
        opened = !opened
        fold()
      })
      tick()
      ticker = setInterval(tick, 1000)
      fold()
    },

    unmount() {
      clearInterval(ticker)
      island?.dispose()
      root?.classList.remove('du')
      root = phone = cover = inside = island = null
    },

    show(slot, next) {
      if (slot === 'media') return play(next)
      card = next
      const s = summarize(next.presentation)
      cover?.notify(s)
      island?.announce(s, salienceOf(next))
      inside?.converse(next)
      fold()
    },
    update(slot, next) {
      if (slot === 'media') {
        media = next
        cover?.playing(next)
        inside?.playing(next)
        return
      }
      card = next
      inside?.converse(next)
      fold()
    },
    clear(slot) {
      if (slot === 'media') return play(null)
      card = null
      inside?.hangUp()
      fold()
    },
    idle() {
      fold()
    },

    frame(clock) {
      if (media) {
        const p = media.presentation
        const t = clock.slots.media?.t
        const i = activeBlockIndex(p, t)
        const rest = t !== undefined && (p.hints?.breaks ?? []).some((b) => t >= b.at && t < b.until)
        if (i !== shownLine || rest !== resting) {
          shownLine = i
          resting = rest
          const texts = p.blocks.map((b) => (b.type === 'text' ? b.text : ''))
          cover?.line(rest ? '♪' : (texts[i] ?? null))
          inside?.line(texts, i, rest)
        }
      }
      if (card) inside?.reveal(clock.slots.card?.t)
    },
  }
}
