import { Content, type Presentation, type SignalFrame, type Surface, type ThemeManifest } from '@contract'
import type { ContentStore } from './contents'
import type { PackContext } from './pack-api'
import { schedule, type SurfaceConfig } from './scheduler'
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
// folds a late answer into OnAir.directions.
export function createStageService(opts: StageServiceOptions) {
  const now = opts.now ?? Date.now
  let consuming = false
  const asked = new Map<string, string>() // "surface/slot" → signature last asked about

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

  function run(): void {
    if (consuming) return
    const out = schedule({
      surfaces: opts.surfaces(),
      manifests: opts.manifests,
      contents: opts.contents.list(),
      current: opts.stage.snapshot().surfaces,
      now: now(),
    })
    consuming = true
    try {
      for (const id of out.finished) opts.contents.remove(id)
    } finally {
      consuming = false
    }
    if (JSON.stringify(out.surfaces) !== JSON.stringify(opts.stage.snapshot().surfaces)) opts.stage.update(out.surfaces)
    directOnAir()
  }

  const offChange = opts.contents.onChange(run)
  const timer = setInterval(run, opts.tickMs ?? 500)

  const packContext: PackContext = {
    upsert: (content) => opts.contents.upsert(Content.parse(content)),
    remove: (id) => void opts.contents.remove(id),
    emitSignal: opts.emitSignal,
  }

  return {
    run,
    packContext,
    stop(): void {
      clearInterval(timer)
      offChange()
    },
  }
}

export type StageService = ReturnType<typeof createStageService>
