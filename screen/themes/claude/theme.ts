// Claude · an ivory page where the spark greets, thinks, and writes what
// arrives into the day's conversations, with an artifact open beside them for
// what stays and changes. Design notes: ./README.md.
import type { Block, OnAir } from '@contract'
import { activeBlockIndex, salienceOf } from '@screen/primitives/blocks'
import { watchScale } from '@screen/primitives/scale'
import '@screen/tokens/newsreader.css'
import type { Theme } from '@screen/runtime/theme-api'
import { createArtifact, type Artifact } from './parts/artifact'
import { createMessage, type Message, type Phase } from './parts/message'
import { createPage, type Page, type Recent } from './parts/page'
import { ago, clockOf, remember, revise, topicOf, type Conversation } from './parts/thread'
import { greeting, LISTENING, pick, THINKING } from './parts/words'
import './theme.css'

/** How long the spark thinks before the first word, for a card of normal salience. */
const THINK_S = 1.4
/** At rest on an empty page, the spark stirs this often (seconds). */
const STIR_S = 36
/** Earlier replies set above a conversation's newest when the page turns to it. */
const PAST_TURNS = 4
/** How often the Recents' "… ago" are brought up to date. */
const RECENTS_MS = 1000

/** The card's clock: its own for self content, else since it went on air. */
const cardTime = (onAir: OnAir, t: number | undefined) => (onAir.presentation.timeline.kind === 'self' && t !== undefined ? t : (Date.now() - onAir.since) / 1000)

/** A reply in the thread: the time it was said, over what was said. */
function turnOf(message: Message, at: number, past: boolean): HTMLElement {
  const turn = document.createElement('div')
  turn.className = past ? 'cl-turn is-past' : 'cl-turn'
  const stamp = document.createElement('div')
  stamp.className = 'cl-stamp'
  stamp.textContent = clockOf(at)
  turn.append(stamp, message.el)
  return turn
}

/** An earlier reply, already written. */
function pastTurn(blocks: readonly Block[], at: number): HTMLElement {
  const message = createMessage(blocks, 0)
  message.reveal(Infinity)
  return turnOf(message, at, true)
}

export default function createClaudeTheme(): Theme {
  let root: HTMLElement | null = null
  let page: Page | null = null
  let artifact: Artifact | null = null
  let stopScale: (() => void) | null = null
  let offSignal: (() => void) | null = null
  let card: OnAir | null = null
  let message: Message | null = null
  let phase: Phase = 'done'
  let thinking = ''
  let media: OnAir | null = null
  let conversations: Conversation[] = []
  /** The conversation the page shows, and its replies on the page by content id. */
  let topic = ''
  let turns = new Map<string, HTMLElement>()
  let listedAt = 0
  let last = 0
  let stirred = 0
  /** Loudness, against its own running average, so the spark swells on what is loud for this track. */
  let mean = 0

  function open(next: OnAir): void {
    if (!page) return
    card = next
    const s = salienceOf(next)
    const p = next.presentation
    const { key } = topicOf(next)
    const continuing = key === topic
    conversations = remember(conversations, next)
    listedAt = 0

    const speaker = p.context.speaker?.name
    const by = [speaker && !/^claude$/i.test(speaker) ? speaker : '', p.context.byline ?? ''].filter(Boolean).join(' · ')
    page.header(p.context.title ?? '', by)
    page.tone(s === 'quiet')

    // A card worth a glance is answered at once; a quiet one doesn't make a show of thinking.
    message = createMessage(p.blocks, s === 'normal' ? THINK_S : 0)
    thinking = pick(THINKING, next.contentId) + '…'
    const turn = turnOf(message, next.since, false)
    if (continuing) {
      // Said again (a card in rotation): it moves down to be the newest, rather than repeating.
      turns.get(next.contentId)?.remove()
      turns.set(next.contentId, turn)
      page.converse(turn)
    } else {
      const earlier = (conversations[0]?.turns ?? []).filter((t) => t.contentId !== next.contentId).slice(-PAST_TURNS)
      turns = new Map(earlier.map((t) => [t.contentId, pastTurn(t.blocks, t.at)]))
      const past = [...turns.values()]
      turns.set(next.contentId, turn)
      page.converse(turn, past)
      topic = key
    }
    page.place('chat')
    if (s === 'attention') {
      page.spark.flare()
      page.alert()
    }
  }

  function close(): void {
    card = null
    message = null
    listedAt = 0
    page?.verb('')
    page?.place('home')
  }

  function recents(nowMs: number): Recent[] {
    return conversations.map((c) => {
      const active = !!card && c.key === topic
      return { key: c.key, name: c.name, ago: ago(c.updated, nowMs), active, writing: active && phase !== 'done' }
    })
  }

  return {
    mount(el, ctx) {
      root = el
      el.classList.add('cl')
      page = createPage(el)
      artifact = createArtifact(page.pane)
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
      root = page = artifact = stopScale = offSignal = card = message = media = null
    },

    show(slot, next) {
      if (slot === 'media') media = next
      else if (slot === 'artifact') {
        artifact?.show(next)
        page?.artifact(true)
      } else open(next)
    },
    update(slot, next) {
      if (slot === 'media') media = next
      else if (slot === 'artifact') artifact?.update(next)
      else if (!card || !message) open(next)
      else {
        card = next
        conversations = revise(conversations, next)
        message.update(next.presentation.blocks, cardTime(next, undefined))
      }
    },
    clear(slot) {
      if (slot === 'media') media = null
      else if (slot === 'artifact') {
        artifact?.clear()
        page?.artifact(false)
      } else close()
    },
    idle() {
      close()
      artifact?.clear()
      page?.artifact(false)
      media = null
    },

    frame(clock) {
      if (!page) return
      const dt = last ? Math.min(0.05, (clock.now - last) / 1000) : 0
      last = clock.now
      const nowMs = Date.now()

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
      const ctx = media?.presentation.context
      page.playing(ctx ? { title: ctx.title ?? '♪', byline: ctx.byline ?? ctx.speaker?.name ?? '', ...(ctx.art ? { art: ctx.art } : {}) } : null)

      if (card && message) {
        const was = phase
        phase = message.reveal(cardTime(card, clock.slots.chat?.t))
        if (phase !== was) listedAt = 0
        page.verb(phase === 'thinking' ? thinking : '')
        page.status(media ? (line ?? pick(LISTENING, media.contentId) + '…') : null, about)
        const quiet = salienceOf(card) === 'quiet'
        page.spark.mood(phase === 'done' ? (media ? 'listen' : 'rest') : quiet ? 'listen' : 'think')
      } else if (media) {
        // Listening along: the spark over the line, what plays as a card under it.
        page.home('listening')
        if (line) page.homeLine(`${media.contentId}:${line}`, line, clock.now, 'line')
        else page.homeLine(`${media.contentId}:rest`, pick(LISTENING, media.contentId) + '…', clock.now, 'verb')
        page.status(null, '')
        page.spark.mood('listen')
      } else {
        const hello = greeting(new Date(nowMs))
        page.home('greeting')
        page.homeLine(`hello:${hello}`, hello, clock.now, 'greeting')
        page.status(null, '')
        page.spark.mood('rest')
        if (clock.now - stirred > STIR_S * 1000) {
          if (stirred) page.spark.beat(0.35)
          stirred = clock.now
        }
      }

      if (nowMs - listedAt > RECENTS_MS) {
        listedAt = nowMs
        page.recents(recents(nowMs))
      }
      artifact?.frame(nowMs)
      page.frame(clock.now, dt, card && message ? message.pen() : null)
    },
  }
}
