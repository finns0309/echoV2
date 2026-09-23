// The inside display, open: two apps in Split View, the hinge between them, as in
// Apple's own pictures of it. On the left, Messages, light: each card is a thread
// from its sender, bubbles arriving at their `at` times with the typing dots just
// before each. On the right, the player: the cover blurred behind, the current
// line bright and the ones either side dim (or, with nothing playing, a clock).
import type { Block, OnAir } from '@contract'
import { progressRatio, valueParts } from '@screen/primitives/blocks'
import { setLang, detectLang } from '@screen/primitives/text'
import { dueAt, summarize } from './card'
import { clock, dateLine, el } from './dom'

const KEEP = 14 // bubbles kept in the thread
const TYPING_S = 0.9 // the dots show this long before a bubble

function bubble(b: Block): HTMLElement {
  if (b.type === 'text') {
    const cls = b.role === 'annotation' ? 'du-bubble du-aside' : b.role === 'attribution' ? 'du-credit' : 'du-bubble'
    const e = el('div', cls)
    const i = b.emphasis ? b.text.indexOf(b.emphasis) : -1
    const parts: (string | HTMLElement)[] = i < 0 ? [b.text] : [b.text.slice(0, i), el('strong', '', b.emphasis), b.text.slice(i + b.emphasis!.length)]
    if (b.reading) {
      const r = document.createElement('ruby')
      r.append(...parts, el('rt', '', b.reading))
      e.append(r)
    } else e.append(...parts)
    return e
  }
  if (b.type === 'value') {
    const { label, number, unit, delta } = valueParts(b)
    const e = el('div', 'du-bubble du-figure')
    if (label) e.append(el('small', '', label))
    const n = el('div', 'du-figure-n', number)
    if (unit) n.append(el('span', '', unit))
    if (delta) n.append(el('em', `is-${delta.dir}`, delta.text))
    e.append(n)
    return e
  }
  if (b.type === 'progress') {
    const e = el('div', 'du-bubble du-meter')
    const head = el('small', '')
    head.append(el('span', '', b.label ?? ''), el('b', '', `${Math.round(progressRatio(b) * 100)}%`))
    const bar = el('div', 'du-meter-bar')
    const fill = el('i', '')
    fill.style.setProperty('--p', progressRatio(b).toFixed(4))
    bar.append(fill)
    e.append(head, bar)
    return e
  }
  const e = el('div', 'du-bubble du-photo')
  const img = el('img', '')
  img.src = b.src
  img.alt = b.alt ?? ''
  e.append(img)
  return e
}

export function createInside(player: HTMLElement, chatApp: HTMLElement) {
  player.classList.add('du-music')
  chatApp.classList.add('du-messages')

  // — the player —
  const bg = el('img', 'du-player-bg')
  bg.alt = ''
  const head = el('div', 'du-player-head')
  const art = el('img', 'du-player-art')
  art.alt = ''
  const names = el('div', 'du-player-names')
  const title = el('b', '')
  const by = el('span', '')
  names.append(title, by)
  head.append(art, names)
  const lines = el('div', 'du-player-lines')
  const widget = el('div', 'du-widget')
  const wTime = el('div', 'du-widget-time')
  const wDate = el('div', 'du-widget-date')
  widget.append(wDate, wTime)
  player.append(bg, head, lines, widget)

  // — the chat —
  const bar = el('div', 'du-chat-bar')
  const avatar = el('i', 'du-app-icon')
  const who = el('b', '', 'メッセージ')
  bar.append(el('span', 'du-chat-back', '‹'), avatar, who)
  const thread = el('div', 'du-thread')
  const typing = el('div', 'du-bubble du-typing')
  typing.append(el('i', ''), el('i', ''), el('i', ''))
  const empty = el('div', 'du-chat-empty', 'メッセージはありません')
  const compose = el('div', 'du-compose')
  compose.append(el('i', 'du-compose-plus', '+'), el('span', 'du-compose-field', 'iMessage'))
  chatApp.append(bar, thread, empty, compose)

  let chat: { id: string; blocks: readonly Block[]; group: HTMLElement; shown: number } | null = null

  function trim(): void {
    const all = [...thread.querySelectorAll('.du-bubble:not(.du-typing), .du-credit, .du-stamp')]
    for (const e of all.slice(0, Math.max(0, all.length - KEEP))) e.remove()
    for (const g of thread.querySelectorAll('.du-group')) if (!g.children.length) g.remove()
  }

  return {
    tick(d: Date): void {
      const t = clock(d)
      if (wTime.textContent !== t) wTime.textContent = t
      const day = dateLine(d)
      if (wDate.textContent !== day) wDate.textContent = day
    },

    playing(onAir: OnAir | null): void {
      player.classList.toggle('has-player', !!onAir)
      if (!onAir) return
      const ctx = onAir.presentation.context
      player.classList.toggle('has-art', !!ctx.art)
      if (ctx.art && art.getAttribute('src') !== ctx.art) art.src = bg.src = ctx.art
      title.textContent = ctx.title ?? ''
      by.textContent = ctx.byline ?? ctx.speaker?.name ?? ''
      setLang(lines, detectLang(onAir.presentation.blocks.map((b) => (b.type === 'text' ? b.text : '')).join('')))
    },
    /** The current line of what plays, by index, with its neighbours. */
    line(texts: readonly string[], i: number, rest: boolean): void {
      const at = (k: number, cls: string) => (texts[k] ? [el('p', cls, texts[k])] : [])
      if (rest) lines.replaceChildren(...at(i, 'is-past'), el('p', 'is-now is-rest', '♪'), ...at(i + 1, 'is-next'))
      else lines.replaceChildren(...at(i - 1, 'is-past'), ...(i >= 0 ? at(i, 'is-now') : []), ...at(i + 1, 'is-next'), ...at(i + 2, 'is-next is-far'))
    },

    /** A card on air: a new thread, or the same one with new data. */
    converse(onAir: OnAir): void {
      const s = summarize(onAir.presentation)
      avatar.textContent = s.mark
      avatar.style.setProperty('--app', s.color)
      who.textContent = s.app
      chatApp.classList.add('has-chat')
      const blocks = onAir.presentation.blocks
      if (chat?.id === onAir.contentId) {
        // Same thread. A status that changed is set again; lines added arrive as they come.
        const changed = chat.blocks.slice(0, chat.shown).some((b, k) => JSON.stringify(b) !== JSON.stringify(blocks[k]))
        chat.blocks = blocks
        if (changed) {
          chat.group.replaceChildren(...blocks.slice(0, chat.shown).map(bubble))
        }
        return
      }
      const group = el('div', 'du-group')
      group.style.setProperty('--app', s.color)
      setLang(group, detectLang(blocks.map((b) => (b.type === 'text' ? b.text : '')).join('')))
      thread.append(el('div', 'du-stamp', `${s.app} · 今`), group)
      chat = { id: onAir.contentId, blocks, group, shown: 0 }
    },

    /** Bubbles due by `t` seconds into the card arrive; the dots show for the next one. */
    reveal(t: number | undefined): void {
      if (!chat) return
      const now = t ?? Infinity
      while (chat.shown < chat.blocks.length && dueAt(chat.blocks[chat.shown]!) <= now) {
        typing.remove()
        const b = bubble(chat.blocks[chat.shown]!)
        b.classList.add('is-new')
        chat.group.append(b)
        chat.shown++
        trim()
      }
      const next = chat.blocks[chat.shown]
      const soon = !!next && dueAt(next) - now <= TYPING_S
      if (soon && typing.parentElement !== chat.group) chat.group.append(typing)
      else if (!soon && typing.parentElement) typing.remove()
    },

    /** The card left the air; its thread stays, as a chat does. */
    hangUp(): void {
      typing.remove()
      chat = null
    },
  }
}
