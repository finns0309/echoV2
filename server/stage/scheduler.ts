import type { Content, OnAir, Presentation, Priority, SlotSpec, Surface, ThemeManifest } from '@contract'

// The scheduler: a pure function from (surfaces, contents, what's on air, now)
// to the next stage. Rules: docs/CONTRACT.md §5.

export interface SurfaceConfig {
  id: string
  profile: string
  theme: string
}

export interface ScheduleInput {
  surfaces: readonly SurfaceConfig[]
  manifests: Readonly<Record<string, ThemeManifest>>
  contents: readonly Content[]
  current: Readonly<Record<string, Surface>>
  now: number
}

export interface ScheduleOutput {
  surfaces: Record<string, Surface>
  /** Contents whose run completed this pass; the caller consumes them. */
  finished: string[]
}

const RANK: Record<Priority, number> = { ambient: 0, normal: 1, urgent: 2 }
const ROLE_ORDER: Record<SlotSpec['role'], number> = { main: 0, side: 1, ambient: 2 }
const MIN_DWELL_S = 6
const TAIL_S = 6

/** How long a self-timed presentation stays up: explicit dwell, or last block + a tail. */
export function dwellSeconds(p: Presentation): number {
  if (p.hints?.dwell) return p.hints.dwell
  const last = Math.max(0, ...p.blocks.map((b) => ('until' in b && b.until) || ('at' in b && b.at) || 0))
  return Math.max(MIN_DWELL_S, last + TAIL_S)
}

function completed(content: Content, onAir: OnAir, now: number): boolean {
  const tl = content.presentation.timeline
  if (tl.kind === 'self') return now - onAir.since >= dwellSeconds(content.presentation) * 1000
  if (tl.kind === 'wall') return tl.end !== undefined && now >= tl.end
  return false // media ends when its pack removes it; none stays until removed or expired
}

function mediaInBreak(content: Content, now: number): boolean {
  const tl = content.presentation.timeline
  const breaks = content.presentation.hints?.breaks
  if (tl.kind !== 'media' || !breaks?.length) return false
  const position = tl.position + ((now - tl.sampledAt) / 1000) * tl.rate
  return breaks.some((b) => position >= b.at && position < b.until)
}

function fits(content: Content, spec: SlotSpec): boolean {
  if (!spec.timelines.includes(content.presentation.timeline.kind)) return false
  return !spec.kinds || spec.kinds.includes(content.kind)
}

/** Can `challenger` take a slot held by `holder`? */
function canPreempt(challenger: Content, holder: Content, now: number): boolean {
  const c = RANK[challenger.priority]
  const h = mediaInBreak(holder, now) ? RANK.ambient : RANK[holder.priority]
  if (c <= h) return false
  return challenger.priority === 'urgent' || h === RANK.ambient
}

export function schedule({ surfaces, manifests, contents, current, now }: ScheduleInput): ScheduleOutput {
  const byId = new Map(contents.map((c) => [c.id, c]))
  const finished: string[] = []

  interface SlotRef {
    surface: string
    slot: string
    spec: SlotSpec
    holder: { content: Content; since: number; directions: unknown } | null
  }

  // 1. Every slot, in fill order, with whatever still legitimately holds it.
  const slots: SlotRef[] = []
  for (const s of surfaces) {
    const manifest = manifests[s.theme]
    if (!manifest) continue
    const entries = Object.entries(manifest.slots).sort(([, a], [, b]) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role])
    for (const [slot, spec] of entries) {
      const prev = current[s.id]?.slots[slot] ?? null
      const content = prev ? byId.get(prev.contentId) : undefined
      let holder: SlotRef['holder'] = null
      if (prev && content && fits(content, spec)) {
        if (completed(content, prev, now)) finished.push(content.id)
        else holder = { content, since: prev.since, directions: prev.directions }
      }
      slots.push({ surface: s.id, slot, spec, holder })
    }
  }

  // 2. Everything else waits, highest priority first, then oldest first.
  const held = new Set(slots.flatMap((s) => (s.holder ? [s.holder.content.id] : [])))
  const waiting = contents
    .filter((c) => !held.has(c.id) && !finished.includes(c.id))
    .sort((a, b) => RANK[b.priority] - RANK[a.priority] || a.createdAt - b.createdAt)

  // Ambient content only appears while nothing more important is on air or waiting.
  const important = (c: Content) => c.priority !== 'ambient'
  const quiet = () => !slots.some((s) => s.holder && important(s.holder.content)) && !waiting.some(important)

  // 3. Fill free slots; let higher priority take held ones.
  for (const s of slots) {
    const pick = (accept: (c: Content) => boolean) => {
      const i = waiting.findIndex((c) => fits(c, s.spec) && accept(c))
      return i < 0 ? undefined : waiting.splice(i, 1)[0]
    }
    if (!s.holder) {
      const next = pick((c) => important(c) || quiet())
      if (next) s.holder = { content: next, since: now, directions: undefined }
      continue
    }
    const holder = s.holder.content
    const challenger = pick((c) => canPreempt(c, holder, now))
    if (challenger) {
      waiting.push(holder) // back in line; it keeps its place in the store
      s.holder = { content: challenger, since: now, directions: undefined }
    }
  }

  // 4. Render the stage.
  const out: Record<string, Surface> = {}
  for (const s of surfaces) out[s.id] = { profile: s.profile, theme: s.theme, slots: {} }
  for (const s of slots) {
    const h = s.holder
    out[s.surface]!.slots[s.slot] = h
      ? { contentId: h.content.id, presentation: h.content.presentation, since: h.since, ...(h.directions === undefined ? {} : { directions: h.directions }) }
      : null
  }
  return { surfaces: out, finished }
}
