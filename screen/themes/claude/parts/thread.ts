// What has been said today, as Claude keeps conversations: each card is a
// reply in the conversation of its topic (its title, else who said it), and
// the conversations are the Recents, newest first. Lives only as long as the
// screen does, like a chat that was never saved. Pure.
import type { Block, OnAir } from '@contract'
import { toText } from '@screen/primitives/blocks'

/** Replies kept per conversation, and conversations kept. */
const KEEP_TURNS = 8
const KEEP_CONVERSATIONS = 12
/** A conversation named by its first line is cut to this many characters. */
const NAME_CHARS = 18

export interface Turn {
  contentId: string
  blocks: readonly Block[]
  /** When it went on air, epoch ms. */
  at: number
}

export interface Conversation {
  key: string
  name: string
  turns: Turn[]
  /** Epoch ms of the latest reply. */
  updated: number
}

/** Which conversation a card belongs to, and what the Recents call it. */
export function topicOf(onAir: OnAir): { key: string; name: string } {
  const { title, speaker } = onAir.presentation.context
  if (title) return { key: `title:${title}`, name: title }
  if (speaker?.name) return { key: `speaker:${speaker.name}`, name: speaker.name }
  // Untitled: a conversation of its own, named by how it starts, as Claude names a new chat.
  const first = onAir.presentation.blocks.map(toText).find(Boolean) ?? 'New chat'
  const chars = [...first]
  return { key: `card:${onAir.contentId}`, name: chars.length > NAME_CHARS ? chars.slice(0, NAME_CHARS - 1).join('') + '…' : first }
}

/**
 * The conversations once `onAir` has been said: its reply goes to the end of
 * its conversation (a card said again moves rather than repeats), and that
 * conversation to the front.
 */
export function remember(conversations: readonly Conversation[], onAir: OnAir): Conversation[] {
  const { key, name } = topicOf(onAir)
  const prev = conversations.find((c) => c.key === key)
  const turn: Turn = { contentId: onAir.contentId, blocks: onAir.presentation.blocks, at: onAir.since }
  const turns = [...(prev?.turns ?? []).filter((t) => t.contentId !== onAir.contentId), turn].slice(-KEEP_TURNS)
  const next: Conversation = { key, name, turns, updated: Math.max(onAir.since, prev?.updated ?? 0) }
  return [next, ...conversations.filter((c) => c.key !== key)].slice(0, KEEP_CONVERSATIONS)
}

/** The same reply with new data (a figure that moved, lines added). */
export function revise(conversations: readonly Conversation[], onAir: OnAir): Conversation[] {
  return conversations.map((c) =>
    c.turns.some((t) => t.contentId === onAir.contentId)
      ? { ...c, turns: c.turns.map((t) => (t.contentId === onAir.contentId ? { ...t, blocks: onAir.presentation.blocks } : t)) }
      : c,
  )
}

/** How long ago, the way Recents say it. */
export function ago(then: number, now: number): string {
  const min = Math.floor((now - then) / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const hr = Math.floor(min / 60)
  return hr < 24 ? `${hr} hr ago` : `${Math.floor(hr / 24)} d ago`
}

/** A reply's time, for the stamp above it in the thread. */
export function clockOf(at: number): string {
  const d = new Date(at)
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}
