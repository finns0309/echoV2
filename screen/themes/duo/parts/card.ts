// A card read the way a phone reads one: which "app" it comes from (the speaker,
// else the title), a coloured icon, and a line or two of body. Pure.
import type { Block, Presentation } from '@contract'
import { toText } from '@screen/primitives/blocks'

export interface Summary {
  /** The app name on a notification: who is talking, else what it is about. */
  app: string
  /** One character for the icon. */
  mark: string
  color: string
  /** The title under the app name, when the app is the speaker. */
  title?: string
  body: string[]
}

const FALLBACK = '#5e5ce6' // iOS indigo

const firstChar = (s: string) => [...s.trim()][0] ?? '·'

export function summarize(p: Presentation): Summary {
  const { title, speaker, palette } = p.context
  const app = speaker?.name ?? title ?? 'echo'
  const body = p.blocks
    .filter((b) => !(b.type === 'text' && b.role === 'attribution'))
    .map((b) => toText(b))
    .filter(Boolean)
  return {
    app,
    mark: firstChar(app),
    color: palette?.[0] ?? FALLBACK,
    ...(speaker && title ? { title } : {}),
    body,
  }
}

/** When a block is due, in seconds from the start: text has its own `at`, the rest shows at once. */
export const dueAt = (b: Block) => (b.type === 'text' ? (b.at ?? 0) : 0)
