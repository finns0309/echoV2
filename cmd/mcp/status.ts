import type { StageState } from '@contract'

// What the `status` tool returns: enough for an agent to know what is on screen
// and what is waiting, without dumping every block (a song carries hundreds).

export interface ContentSummary {
  id: string
  kind: string
  priority: string
  title?: string
}

export interface OnAirSummary extends Partial<ContentSummary> {
  id: string
  surface: string
  slot: string
  theme: string
  title?: string
  /** The first primary line: the word on a word card, the message on a message card. */
  headline?: string
  onAirSeconds: number
}

const HEADLINE_MAX = 60
const clip = (t: string) => (t.length > HEADLINE_MAX ? t.slice(0, HEADLINE_MAX - 1) + '…' : t)

export function summarizeStatus(stage: StageState, contents: readonly ContentSummary[], now: number) {
  const byId = new Map(contents.map((c) => [c.id, c]))
  const onAir: OnAirSummary[] = []
  for (const [surface, s] of Object.entries(stage.surfaces)) {
    for (const [slot, air] of Object.entries(s.slots)) {
      if (!air) continue
      const c = byId.get(air.contentId)
      const { context, timeline, blocks } = air.presentation
      // Media content is a script played along with the audio; its first line says nothing about it.
      const first = timeline.kind === 'media' ? undefined : blocks.find((b) => b.type === 'text' && b.role === 'primary')
      const headline = first?.type === 'text' ? first.text : undefined
      onAir.push({
        surface,
        slot,
        theme: s.theme,
        id: air.contentId,
        ...(c ? { kind: c.kind, priority: c.priority } : {}),
        ...(context.title ? { title: clip(context.title) } : {}),
        ...(headline ? { headline: clip(headline) } : {}),
        onAirSeconds: Math.max(0, Math.round((now - air.since) / 1000)),
      })
    }
  }
  // The content store also holds what is on air until its run finishes; only the rest is waiting.
  const airing = new Set(onAir.map((a) => a.id))
  const queued = contents.filter((c) => !airing.has(c.id))
  return { onAir, queued }
}
