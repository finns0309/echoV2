import type { Content, OnAir, Presentation, Priority, Route, SlotSpec, Surface, ThemeManifest } from '@contract'

// The scheduler: a pure function from (surfaces, contents, what's on air, now)
// to the next stage. Rules: docs/CONTRACT.md §5.

export interface SurfaceConfig {
  id: string
  profile: string
  theme: string
  /** What this surface takes; absent means everything. */
  accepts?: Route
  /** Also takes what no visible surface's route admits. */
  fallback?: boolean
  /** Hidden surfaces get nothing; what they held goes elsewhere. */
  hidden?: boolean
}

const texts = (p: Presentation) => p.blocks.flatMap((b) => (b.type === 'text' ? [b.text] : []))

/**
 * Self-timed content whose text was rewritten, rather than added to, starts over:
 * a re-sent countdown plays from its first frame. Appended lines (a growing
 * message) and changed values (a status) keep the clock running.
 */
function rewritten(before: Presentation, after: Presentation): boolean {
  if (after.timeline.kind !== 'self') return false
  const next = texts(after)
  return texts(before).some((t, i) => next[i] !== t)
}

/** Does `route` admit `content`? No route admits everything. */
export function admits(route: Route | undefined, content: Content): boolean {
  if (!route) return true
  return (!route.packs || route.packs.includes(content.pack)) && (!route.kinds || route.kinds.includes(content.kind))
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

/** The order waiting content goes on air in: highest priority first, then oldest first. */
export const waitingOrder = (a: Content, b: Content): number => RANK[b.priority] - RANK[a.priority] || a.createdAt - b.createdAt
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

/** Whether a slot can hold this content (timeline kind and, for dedicated slots, kind). */
export function fits(content: Content, spec: SlotSpec): boolean {
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
  const visible = surfaces.filter((s) => !s.hidden)

  // Routing: a surface takes what its route admits; a fallback surface also
  // takes what no visible surface admits (e.g. while the surface for it is hidden).
  const homeless = new Map<string, boolean>()
  const isHomeless = (c: Content) => {
    let v = homeless.get(c.id)
    if (v === undefined) homeless.set(c.id, (v = !visible.some((s) => admits(s.accepts, c))))
    return v
  }
  const routes = (s: SurfaceConfig, c: Content) => !s.hidden && (admits(s.accepts, c) || (!!s.fallback && isHomeless(c)))

  interface SlotRef {
    surface: SurfaceConfig
    slot: string
    spec: SlotSpec
    holder: { content: Content; since: number; directions: unknown } | null
  }
  const takes = (s: SlotRef, c: Content) => fits(c, s.spec) && routes(s.surface, c)

  // 1. Every slot, in fill order, with whatever still legitimately holds it.
  const slots: SlotRef[] = []
  for (const s of surfaces) {
    const manifest = manifests[s.theme]
    if (!manifest) continue
    const entries = Object.entries(manifest.slots).sort(([, a], [, b]) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role])
    for (const [slot, spec] of entries) {
      const ref: SlotRef = { surface: s, slot, spec, holder: null }
      const prev = current[s.id]?.slots[slot] ?? null
      const content = prev ? byId.get(prev.contentId) : undefined
      if (prev && content && takes(ref, content)) {
        if (completed(content, prev, now)) finished.push(content.id)
        else if (rewritten(prev.presentation, content.presentation)) ref.holder = { content, since: now, directions: undefined }
        else ref.holder = { content, since: prev.since, directions: prev.directions }
      }
      slots.push(ref)
    }
  }

  // 2. Everything else waits, highest priority first, then oldest first.
  const held = new Set(slots.flatMap((s) => (s.holder ? [s.holder.content.id] : [])))
  const waiting = contents.filter((c) => !held.has(c.id) && !finished.includes(c.id)).sort(waitingOrder)

  // Ambient content only takes a slot while nothing more important is on air on
  // that surface, or waiting for that slot.
  const important = (c: Content) => c.priority !== 'ambient'
  const quiet = (s: SlotRef) =>
    !slots.some((o) => o.surface === s.surface && o.holder && important(o.holder.content)) &&
    !waiting.some((c) => important(c) && takes(s, c))

  const pick = (s: SlotRef, accept: (c: Content) => boolean) => {
    const i = waiting.findIndex((c) => takes(s, c) && accept(c))
    return i < 0 ? undefined : waiting.splice(i, 1)[0]
  }
  const fillFree = () => {
    for (const s of slots) {
      if (s.holder) continue
      const next = pick(s, (c) => important(c) || quiet(s))
      if (next) s.holder = { content: next, since: now, directions: undefined }
    }
  }

  // 3. Free slots first, so nothing is pushed aside while there is room elsewhere;
  //    then higher priority may take held slots; then whatever was pushed aside
  //    gets another chance at a free slot.
  fillFree()
  for (const s of slots) {
    if (!s.holder) continue
    const holder = s.holder.content
    const challenger = pick(s, (c) => canPreempt(c, holder, now))
    if (challenger) {
      waiting.push(holder) // back in line; it keeps its place in the store
      waiting.sort(waitingOrder)
      s.holder = { content: challenger, since: now, directions: undefined }
    }
  }
  fillFree()

  // 4. Render the stage.
  const out: Record<string, Surface> = {}
  for (const s of surfaces) {
    out[s.id] = {
      profile: s.profile,
      theme: s.theme,
      ...(s.accepts ? { accepts: s.accepts } : {}),
      ...(s.fallback ? { fallback: true } : {}),
      ...(s.hidden ? { hidden: true } : {}),
      slots: {},
    }
  }
  for (const s of slots) {
    const h = s.holder
    out[s.surface.id]!.slots[s.slot] = h
      ? { contentId: h.content.id, presentation: h.content.presentation, since: h.since, ...(h.directions === undefined ? {} : { directions: h.directions }) }
      : null
  }
  return { surfaces: out, finished }
}
