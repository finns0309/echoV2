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
  /** The title, or the first primary line when there is none. */
  headline?: string
  onAirSeconds: number
}

const HEADLINE_MAX = 60

export function summarizeStatus(stage: StageState, contents: readonly ContentSummary[], now: number) {
  const byId = new Map(contents.map((c) => [c.id, c]))
  const onAir: OnAirSummary[] = []
  for (const [surface, s] of Object.entries(stage.surfaces)) {
    for (const [slot, air] of Object.entries(s.slots)) {
      if (!air) continue
      const c = byId.get(air.contentId)
      const first = air.presentation.blocks.find((b) => b.type === 'text' && b.role === 'primary')
      const headline = air.presentation.context.title ?? (first?.type === 'text' ? first.text : undefined)
      onAir.push({
        surface,
        slot,
        theme: s.theme,
        id: air.contentId,
        ...(c ? { kind: c.kind, priority: c.priority } : {}),
        ...(headline ? { headline: headline.length > HEADLINE_MAX ? headline.slice(0, HEADLINE_MAX - 1) + '…' : headline } : {}),
        onAirSeconds: Math.max(0, Math.round((now - air.since) / 1000)),
      })
    }
  }
  // The content store also holds what is on air until its run finishes; only the rest is waiting.
  const airing = new Set(onAir.map((a) => a.id))
  const queued = contents.filter((c) => !airing.has(c.id))
  return { onAir, queued }
}
