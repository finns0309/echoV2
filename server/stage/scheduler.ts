import type { Content, OnAir, Presentation, Priority, Salience, SlotSpec, Surface, ThemeManifest } from '@contract'
import { createRouter, type SurfaceConfig } from './routing'

// The scheduler: a pure function from (surfaces, contents, what's on air, now)
// to the next stage. Rules: docs/CONTRACT.md §5.

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

export interface ScheduleInput {
  surfaces: readonly SurfaceConfig[]
  manifests: Readonly<Record<string, ThemeManifest>>
  contents: readonly Content[]
  current: Readonly<Record<string, Surface>>
  now: number
  /** Nothing on air ends or is pushed aside on its own; free slots still fill. */
  paused?: boolean
  /** On-air content the user skipped: it ends this pass, whatever its clock says. */
  ending?: ReadonlySet<string>
  /** Milliseconds an on-air content's clock stood still while the stage was paused. */
  credit?: ReadonlyMap<string, number>
}

export interface ScheduleOutput {
  surfaces: Record<string, Surface>
  /** Contents whose run completed this pass; the caller consumes them. */
  finished: string[]
}

const RANK: Record<Priority, number> = { ambient: 0, normal: 1, urgent: 2 }

/** The order waiting content goes on air in: highest priority first, then oldest first. */
export const waitingOrder = (a: Content, b: Content): number => RANK[b.priority] - RANK[a.priority] || a.createdAt - b.createdAt
/** A content's own salience hint wins; otherwise what it waited for says how loud it should be. */
const SALIENCE_BY_PRIORITY: Record<Priority, Salience> = { ambient: 'quiet', normal: 'normal', urgent: 'attention' }
export const salienceOf = (c: Content): Salience => c.presentation.hints?.salience ?? SALIENCE_BY_PRIORITY[c.priority]
const LOUDNESS: readonly Salience[] = ['quiet', 'normal', 'attention']
/** A window's loudness is a ceiling: louder content is shown at that level there. */
export const capSalience = (s: Salience, ceiling: Salience | undefined): Salience =>
  ceiling && LOUDNESS.indexOf(s) > LOUDNESS.indexOf(ceiling) ? ceiling : s

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

export function schedule({ surfaces, manifests, contents, current, now, paused, ending, credit }: ScheduleInput): ScheduleOutput {
  const byId = new Map(contents.map((c) => [c.id, c]))
  const routes = createRouter(surfaces)
  const finished: string[] = []

  interface SlotRef {
    surface: SurfaceConfig
    slot: string
    spec: SlotSpec
    holder: { content: Content; since: number; directions: unknown } | null
  }
  const takes = (s: SlotRef, c: Content) => fits(c, s.spec) && routes(s.surface, c)
  const onAir = (content: Content) => ({ content, since: now, directions: undefined })

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
        if (ending?.has(content.id) || (!paused && completed(content, prev, now - (credit?.get(content.id) ?? 0)))) finished.push(content.id)
        else if (rewritten(prev.presentation, content.presentation)) ref.holder = onAir(content)
        else ref.holder = { content, since: prev.since, directions: prev.directions }
      }
      slots.push(ref)
    }
  }

  // 2. Everything else waits, highest priority first, then oldest first.
  const held = new Set(slots.flatMap((s) => (s.holder ? [s.holder.content.id] : [])))
  const waiting = contents.filter((c) => !held.has(c.id) && !finished.includes(c.id)).sort(waitingOrder)
  const requeue = (c: Content) => {
    waiting.push(c) // back in line; it keeps its place in the store
    waiting.sort(waitingOrder)
  }

  // Ambient content only takes a slot while nothing more important is on air on
  // that surface, or waiting for that slot.
  const important = (c: Content) => c.priority !== 'ambient'
  const quiet = (s: SlotRef) =>
    !slots.some((o) => o.surface === s.surface && o.holder && important(o.holder.content)) &&
    !waiting.some((c) => important(c) && takes(s, c))

  // Free slots an ensemble is waiting to fill: content behind it in line may not take them.
  const reserved = new Map<SlotRef, Content>()
  const behind = (s: SlotRef, c: Content) => {
    const lead = reserved.get(s)
    return !!lead && waitingOrder(c, lead) > 0
  }

  // The next single content for a slot. Ensemble members only go on as a whole (placeEnsembles).
  const pick = (s: SlotRef, accept: (c: Content) => boolean) => {
    const i = waiting.findIndex((c) => !c.together && takes(s, c) && !behind(s, c) && accept(c))
    return i < 0 ? undefined : waiting.splice(i, 1)[0]
  }

  const fillFree = () => {
    for (const s of slots) {
      if (s.holder) continue
      const next = pick(s, (c) => important(c) || quiet(s))
      if (next) s.holder = onAir(next)
    }
  }

  const preempt = () => {
    for (const s of slots) {
      if (!s.holder) continue
      const holder = s.holder.content
      const challenger = pick(s, (c) => canPreempt(c, holder, now))
      if (challenger) {
        requeue(holder)
        s.holder = onAir(challenger)
      }
    }
  }

  // One distinct slot per member, free slots first. With `occupancy` false it only
  // asks whether the ensemble could ever fit, ignoring what is on air.
  const assign = (members: Content[], occupancy: boolean): SlotRef[] | null => {
    const used = new Set<SlotRef>()
    for (const m of members) {
      const ok = (s: SlotRef) =>
        !used.has(s) &&
        takes(s, m) &&
        (!occupancy || (s.holder ? !paused && canPreempt(m, s.holder.content, now) : !behind(s, m) && (important(m) || quiet(s))))
      const s = slots.find((x) => ok(x) && !(occupancy && x.holder)) ?? slots.find(ok)
      if (!s) return null
      used.add(s)
    }
    return [...used]
  }

  // Ensembles go on air together, sharing one start, or not at all. While one waits
  // for its partners' slots, it keeps the free ones from later content.
  const placeEnsembles = () => {
    const ensembles = new Map<string, Content[]>()
    for (const c of waiting) if (c.together) ensembles.set(c.together.id, [...(ensembles.get(c.together.id) ?? []), c])
    const playing = new Set(slots.flatMap((s) => (s.holder?.content.together ? [s.holder.content.together.id] : [])))
    for (const [id, members] of ensembles) {
      if (playing.has(id)) continue // part of it is still on; the rest waits to go on with it next time
      if (members.length < members[0]!.together!.of) continue // members still on their way
      const placed = assign(members, true)
      if (placed) {
        for (const m of members) waiting.splice(waiting.indexOf(m), 1)
        placed.forEach((s, i) => {
          if (s.holder) requeue(s.holder.content)
          s.holder = onAir(members[i]!)
        })
      } else if (assign(members, false)) {
        for (const s of slots) if (!s.holder && !reserved.has(s) && members.some((m) => takes(s, m))) reserved.set(s, members[0]!)
      }
    }
  }

  // 3. Ensembles first; then free slots, so nothing is pushed aside while there is
  //    room elsewhere; then higher priority may take held slots; then whatever was
  //    pushed aside gets another chance at a free slot.
  placeEnsembles()
  fillFree()
  if (!paused) preempt()
  fillFree()

  // 4. Render the stage.
  const out: Record<string, Surface> = {}
  for (const s of surfaces) {
    out[s.id] = {
      ...(s.name ? { name: s.name } : {}),
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
      ? {
          contentId: h.content.id,
          presentation: h.content.presentation,
          since: h.since,
          salience: capSalience(salienceOf(h.content), s.surface.loudness),
          ...(h.directions === undefined ? {} : { directions: h.directions }),
        }
      : null
  }
  return { surfaces: out, finished }
}
