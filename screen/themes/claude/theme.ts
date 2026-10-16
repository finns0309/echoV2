// Claude · an ivory page where the spark greets, thinks, and writes what
// arrives. Design notes: ./README.md.
import type { OnAir } from '@contract'
import { activeBlockIndex, salienceOf } from '@screen/primitives/blocks'
import { watchScale } from '@screen/primitives/scale'
import type { Theme } from '@screen/runtime/theme-api'
import { createMessage, type Message } from './parts/message'
import { createPage, type Page } from './parts/page'
import { greeting, LISTENING, pick, THINKING } from './parts/words'
import './theme.css'

/** How long the spark thinks before the first word, for a card of normal salience. */
const THINK_S = 1.4
/** At rest on an empty page, the spark stirs this often (seconds). */
const STIR_S = 36

/** The card's clock: its own for self content, else since it went on air. */
const cardTime = (onAir: OnAir, t: number | undefined) => (onAir.presentation.timeline.kind === 'self' && t !== undefined ? t : (Date.now() - onAir.since) / 1000)

export default function createClaudeTheme(): Theme {
  let root: HTMLElement | null = null
  let page: Page | null = null
  let stopScale: (() => void) | null = null
  let offSignal: (() => void) | null = null
  let card: OnAir | null = null
  let message: Message | null = null
  let thinking = ''
  let media: OnAir | null = null
  let last = 0
  let stirred = 0
  /** Loudness, against its own running average, so the spark swells on what is loud for this track. */
  let mean = 0

  function open(next: OnAir): void {
    if (!page) return
    card = next
    const s = salienceOf(next)
    const p = next.presentation
    const speaker = p.context.speaker?.name
    const by = [speaker && !/^claude$/i.test(speaker) ? speaker : '', p.context.byline ?? ''].filter(Boolean).join(' · ')
    page.header(p.context.title ?? '', by)
    page.tone(s === 'quiet')
    // A card worth a glance is answered at once; a quiet one doesn't make a show of thinking.
    message = createMessage(p.blocks, s === 'normal' ? THINK_S : 0)
    thinking = pick(THINKING, next.contentId) + '…'
    page.column.replaceChildren(message.el)
    page.place('chat')
    if (s === 'attention') {
      page.spark.flare()
      page.alert()
    }
  }

  function close(): void {
    card = null
    message = null
    page?.verb('')
    page?.place('home')
  }

  return {
    mount(el, ctx) {
      root = el
      el.classList.add('cl')
      page = createPage(el)
      stopScale = watchScale(el, '--cl-scale', { deadzoneDiag: 950, max: 2.6 })
      offSignal = ctx.onSignal((f) => {
        if (f.energy !== undefined) {
          mean = mean ? mean + (f.energy - mean) * 0.03 : f.energy
          page?.spark.level((f.energy - mean) / Math.max(mean, 0.02) + 0.3)
        }
        if (f.onset) page?.spark.beat(f.onset)
      })
    },

    unmount() {
      offSignal?.()
      stopScale?.()
      page?.remove()
      root?.classList.remove('cl')
      root = page = stopScale = offSignal = card = message = media = null
    },

    show(slot, next) {
      if (slot === 'media') media = next
      else open(next)
    },
    update(slot, next) {
      if (slot === 'media') {
        media = next
        return
      }
      if (!card || !message) return open(next)
      card = next
      message.update(next.presentation.blocks, cardTime(next, undefined))
    },
    clear(slot) {
      if (slot === 'media') media = null
      else close()
    },
    idle() {
      close()
      media = null
    },

    frame(clock) {
      if (!page) return
      const dt = last ? Math.min(0.05, (clock.now - last) / 1000) : 0
      last = clock.now

      // What plays: its line, or in a break its name.
      let line: string | null = null
      if (media) {
        const p = media.presentation
        const t = clock.slots.media?.t
        const i = activeBlockIndex(p, t)
        const b = p.blocks[i]
        const rest = i < 0 || (t !== undefined && (p.hints?.breaks ?? []).some((r) => t >= r.at && t < r.until))
        if (!rest && b?.type === 'text') line = b.text
      }
      const about = media ? [media.presentation.context.title, media.presentation.context.byline].filter(Boolean).join(' — ') : ''

      if (card && message) {
        const phase = message.reveal(cardTime(card, clock.slots.card?.t))
        page.verb(phase === 'thinking' ? thinking : '')
        page.status(media ? (line ?? pick(LISTENING, media.contentId) + '…') : null, about)
        const quiet = salienceOf(card) === 'quiet'
        page.spark.mood(phase === 'done' ? (media ? 'listen' : 'rest') : quiet ? 'listen' : 'think')
      } else if (media) {
        const title = media.presentation.context.title ?? '♪'
        if (line) {
          page.homeLine(`${media.contentId}:${line}`, line, clock.now)
          page.homeSub(about, false)
        } else {
          page.homeLine(`${media.contentId}:rest`, title, clock.now)
          page.homeSub(pick(LISTENING, media.contentId) + '…', true)
        }
        page.status(null, '')
        page.spark.mood('listen')
      } else {
        const hello = greeting(new Date())
        page.homeLine(`hello:${hello}`, hello, clock.now)
        page.homeSub('', false)
        page.status(null, '')
        page.spark.mood('rest')
        if (clock.now - stirred > STIR_S * 1000) {
          if (stirred) page.spark.beat(0.35)
          stirred = clock.now
        }
      }

      page.frame(clock.now, dt, card && message ? message.pen() : null)
    },
  }
}
