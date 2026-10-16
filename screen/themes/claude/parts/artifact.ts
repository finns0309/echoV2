// An artifact: what stays and changes, open beside the conversation the way
// Claude opens one. A title, a version that counts each change, when it last
// changed, and the content set as a small live document: figures large, bars,
// lines, a picture.
import type { OnAir } from '@contract'
import { detectLang, setLang } from '@screen/primitives/text'
import { createMessage, type Message } from './message'
import { ago } from './thread'

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}

/** A document outline, as the artifact's icon. */
const ICON =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="1.5" width="10" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>'
/** It reads as just updated for this long. */
const FRESH_MS = 2400

export interface Artifact {
  /** A new artifact, in place of whatever was open. */
  show(onAir: OnAir): void
  /** The same artifact with new data: the next version. */
  update(onAir: OnAir): void
  clear(): void
  /** Write in what is due and keep "updated … ago" current. */
  frame(nowMs: number): void
}

export function createArtifact(pane: HTMLElement): Artifact {
  const card = el('div', 'cl-art')
  const head = el('div', 'cl-art-head')
  const icon = el('i', 'cl-art-icon')
  icon.innerHTML = ICON
  const names = el('div', 'cl-art-names')
  const title = el('div', 'cl-art-title')
  const meta = el('div', 'cl-art-meta')
  const version = el('span', 'cl-art-version')
  const when = el('span', 'cl-art-when')
  meta.append(version, when)
  names.append(title, meta)
  head.append(icon, names)
  const body = el('div', 'cl-art-body')
  card.append(head, body)
  pane.append(card)

  let open: { onAir: OnAir; message: Message; version: number; changed: number } | null = null

  function label(onAir: OnAir, v: number): void {
    const { title: t, byline } = onAir.presentation.context
    title.textContent = t ?? 'Status'
    setLang(title, detectLang(t ?? ''))
    version.textContent = [byline, `v${v}`].filter(Boolean).join(' · ')
  }

  return {
    show(onAir) {
      const message = createMessage(onAir.presentation.blocks, 0)
      body.replaceChildren(message.el)
      open = { onAir, message, version: 1, changed: onAir.since }
      label(onAir, 1)
      card.classList.remove('is-entering')
      void card.offsetWidth
      card.classList.add('is-entering')
    },

    update(onAir) {
      if (!open) return this.show(onAir)
      const changed = JSON.stringify(onAir.presentation.blocks) !== JSON.stringify(open.onAir.presentation.blocks)
      open.onAir = onAir
      if (!changed) return label(onAir, open.version)
      open.version++
      open.changed = Date.now()
      open.message.update(onAir.presentation.blocks, (Date.now() - onAir.since) / 1000)
      label(onAir, open.version)
    },

    clear() {
      open = null
    },

    frame(nowMs) {
      if (!open) return
      open.message.reveal((nowMs - open.onAir.since) / 1000)
      card.classList.toggle('is-fresh', nowMs - open.changed < FRESH_MS)
      const text = `Updated ${ago(open.changed, nowMs)}`
      if (when.textContent !== text) when.textContent = text
    },
  }
}
