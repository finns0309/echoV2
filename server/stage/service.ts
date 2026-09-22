import { Content, type SignalFrame, type ThemeManifest } from '@contract'
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
  now?: () => number
  tickMs?: number
}

// Runs the scheduler whenever contents or surfaces change, and on a slow tick so
// dwell endings and expiries take effect. Only writes the stage when it changed.
export function createStageService(opts: StageServiceOptions) {
  const now = opts.now ?? Date.now
  let consuming = false

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
