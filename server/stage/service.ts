import { Content, type Presentation, type SignalFrame, type StageCommand, type Surface, type ThemeManifest } from '@contract'
import type { ContentStore } from './contents'
import type { PackContext } from './pack-api'
import type { SurfaceConfig } from './routing'
import { fits, schedule } from './scheduler'
import type { Stage } from './state'

export interface StageServiceOptions {
  contents: ContentStore
  stage: Stage
  manifests: Readonly<Record<string, ThemeManifest>>
  surfaces: () => readonly SurfaceConfig[]
  emitSignal: (frame: SignalFrame) => void
  /**
   * Optional staging help for on-air content, e.g. an LLM director. The stage
   * only knows it can ask; cmd/display decides who answers. Null = nothing to add.
   */
  direct?: (theme: string, presentation: Presentation) => Promise<unknown>
  now?: () => number
  tickMs?: number
}

// Runs the scheduler whenever contents or surfaces change, and on a slow tick so
// dwell endings and expiries take effect. Only writes the stage when it changed.
// After each pass, asks `direct` once per (slot, content, theme, text) and
// folds a late answer into OnAir.directions. Content still waiting in line is
// asked about ahead of time (once per theme and text), so a director with a
// cache can answer instantly when it finally goes on air.
export function createStageService(opts: StageServiceOptions) {
  const now = opts.now ?? Date.now
  let consuming = false
  const asked = new Map<string, string>() // "surface/slot" → signature last asked about
  const prefetched = new Set<string>() // "theme\ncontent\ntext" already asked about while queued
  let pausedAt: number | null = null
  const credit = new Map<string, number>() // content → ms its dwell clock stood still (paused)
  let ending = new Set<string>() // skipped by the user, ends on the next pass

  // What the text of a presentation is; timeline-only changes (a media clock) don't count.
  const textSignature = (p: Presentation) => p.blocks.map((b) => (b.type === 'text' ? b.text : JSON.stringify(b))).join('\n')

  function writeDirections(surface: string, slot: string, contentId: string, directions: unknown): void {
    const snap = opts.stage.snapshot().surfaces
    const onAir = snap[surface]?.slots[slot]
    if (!onAir || onAir.contentId !== contentId) return // it left the stage meanwhile
    const next: Record<string, Surface> = { ...snap, [surface]: { ...snap[surface]!, slots: { ...snap[surface]!.slots } } }
    const updated = { ...onAir, directions }
    if (directions === undefined) delete updated.directions
    next[surface]!.slots[slot] = updated
    opts.stage.update(next)
  }

  function directOnAir(): void {
    const direct = opts.direct
    if (!direct) return
    for (const [surfaceId, surface] of Object.entries(opts.stage.snapshot().surfaces)) {
      for (const [slot, onAir] of Object.entries(surface.slots)) {
        const ref = `${surfaceId}/${slot}`
        if (!onAir) {
          asked.delete(ref)
          continue
        }
        const signature = `${onAir.contentId}\n${surface.theme}\n${textSignature(onAir.presentation)}`
        const previous = asked.get(ref)
        if (previous === signature) continue
        asked.set(ref, signature)
        // Same content, new text or theme: the old directions no longer fit.
        if (previous?.startsWith(`${onAir.contentId}\n`) && onAir.directions !== undefined) {
          writeDirections(surfaceId, slot, onAir.contentId, undefined)
        }
        direct(surface.theme, onAir.presentation)
          .then((directions) => {
            if (directions != null && asked.get(ref) === signature) writeDirections(surfaceId, slot, onAir.contentId, directions)
          })
          .catch(() => {})
      }
    }
  }

  function prefetchQueued(): void {
    const direct = opts.direct
    if (!direct) return
    const onAir = new Set(
      Object.values(opts.stage.snapshot().surfaces).flatMap((s) => Object.values(s.slots).flatMap((slot) => (slot ? [slot.contentId] : []))),
    )
    const live = new Set<string>()
    for (const content of opts.contents.list()) {
      if (onAir.has(content.id)) continue
      for (const surface of opts.surfaces()) {
        const manifest = opts.manifests[surface.theme]
        if (!manifest || !Object.values(manifest.slots).some((spec) => fits(content, spec))) continue
        const key = `${surface.theme}\n${content.id}\n${textSignature(content.presentation)}`
        live.add(key)
        if (prefetched.has(key)) continue
        prefetched.add(key)
        direct(surface.theme, content.presentation).catch(() => {})
      }
    }
    for (const key of prefetched) if (!live.has(key)) prefetched.delete(key) // forget what left the queue
  }

  function run(): void {
    if (consuming) return
    const out = schedule({
      surfaces: opts.surfaces(),
      manifests: opts.manifests,
      contents: opts.contents.list(),
      current: opts.stage.snapshot().surfaces,
      now: now(),
      paused: pausedAt !== null,
      ending,
      credit,
    })
    ending = new Set()
    consuming = true
    try {
      // Finished runs are consumed, except content kept in rotation, which goes back in line.
      for (const id of out.finished) {
        if (opts.contents.get(id)?.repeat) opts.contents.requeue(id)
        else opts.contents.remove(id)
      }
    } finally {
      consuming = false
    }
    if (JSON.stringify(out.surfaces) !== JSON.stringify(opts.stage.snapshot().surfaces)) opts.stage.update(out.surfaces)
    for (const id of credit.keys()) if (!onAirIds().has(id)) credit.delete(id)
    directOnAir()
    prefetchQueued()
  }

  function onAirIds(): Set<string> {
    return new Set(Object.values(opts.stage.snapshot().surfaces).flatMap((s) => Object.values(s.slots).flatMap((o) => (o ? [o.contentId] : []))))
  }

  /** What a window shows that the user may skip or clear: anything not following a media clock. */
  function movableIn(window: string): Content[] {
    return Object.values(opts.stage.snapshot().surfaces[window]?.slots ?? {}).flatMap((o) => {
      const c = o ? opts.contents.get(o.contentId) : undefined
      return c && c.presentation.timeline.kind !== 'media' ? [c] : []
    })
  }

  /** Carry out a user's StageCommand. Returns how many contents it touched. */
  function dispatch(command: StageCommand): number {
    switch (command.type) {
      case 'skip': {
        const skipped = movableIn(command.window)
        if (!skipped.length) return 0
        for (const c of skipped) ending.add(c.id)
        run()
        return skipped.length
      }
      case 'clear': {
        const gone = command.window
          ? movableIn(command.window)
          : opts.contents.list().filter((c) => c.presentation.timeline.kind !== 'media')
        return opts.contents.removeMany(gone.map((c) => c.id))
      }
      case 'setPaused': {
        if (command.on === (pausedAt !== null)) return 0
        if (command.on) pausedAt = now()
        else {
          // The clocks stood still: what was on air gets back the time it spent paused.
          const stood = now() - pausedAt!
          for (const id of onAirIds()) credit.set(id, (credit.get(id) ?? 0) + stood)
          pausedAt = null
        }
        opts.stage.setPaused(command.on)
        run()
        return 1
      }
    }
  }

  const offChange = opts.contents.onChange(run)
  const timer = setInterval(run, opts.tickMs ?? 500)

  const packContext: PackContext = {
    upsert: (content) => opts.contents.upsert(Content.parse(content)),
    remove: (id) => opts.contents.remove(id),
    emitSignal: opts.emitSignal,
  }

  return {
    run,
    dispatch,
    packContext,
    stop(): void {
      clearInterval(timer)
      offChange()
    },
  }
}

export type StageService = ReturnType<typeof createStageService>
