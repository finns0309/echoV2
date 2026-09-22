import type { OnAir, ScreenBridge, StageState } from '@contract'
import { paletteFromImage } from '@screen/primitives/color'
import { localTime } from './clock'
import type { FrameClock, ScreenContext, Theme, ThemeFactory } from './theme-api'

export interface StageHostOptions {
  root: HTMLElement
  surface: string
  /** Theme id → lazy loader, discovered by the screen entry point. */
  themes: Readonly<Record<string, () => Promise<{ default: ThemeFactory }>>>
  bridge: ScreenBridge
}

export interface StageHost {
  render(state: StageState): void
}

// Mounts the surface's theme and turns stage state into show / update / clear
// calls, then drives the theme with a per-slot clock every frame.
export function createStageHost({ root, surface, themes, bridge }: StageHostOptions): StageHost {
  let rev = -1
  let latest: StageState | null = null
  let syncing = false
  let mounted: { id: string; theme: Theme; el: HTMLElement } | null = null
  let slots: Record<string, OnAir | null> = {} // as shown to the theme (palette filled in)
  let raw: Record<string, OnAir | null> = {} // as received from the stage
  const palettes = new Map<string, string[] | null>() // art URL → palette, once known

  // Content with a picture but no palette gets one taken from the picture, so
  // themes only ever read context.palette. It arrives a moment later as an update.
  function withPalette(onAir: OnAir | null): OnAir | null {
    const ctx = onAir?.presentation.context
    if (!onAir || !ctx?.art || ctx.palette?.length) return onAir
    const art = ctx.art
    if (!palettes.has(art)) {
      palettes.set(art, null)
      void paletteFromImage(art).then((p) => {
        palettes.set(art, p)
        if (p) apply(raw)
      })
    }
    const palette = palettes.get(art)
    return palette ? { ...onAir, presentation: { ...onAir.presentation, context: { ...ctx, palette } } } : onAir
  }

  const ctx: ScreenContext = { surface, onSignal: (listener) => bridge.on('signal', listener) }

  function showIdleLabel(text: string | null): void {
    root.dataset.state = text ? 'idle' : 'on-air'
    const label = root.querySelector(':scope > .echo-idle-label')
    if (!text) return label?.remove()
    if (label) label.textContent = text
    else {
      const el = document.createElement('div')
      el.className = 'echo-idle-label'
      el.textContent = text
      root.appendChild(el)
    }
  }

  async function mount(id: string): Promise<void> {
    mounted?.theme.unmount()
    mounted?.el.remove()
    mounted = null
    slots = {}
    const load = themes[id]
    if (!load) return showIdleLabel(id ? `echo · 没有主题「${id}」` : 'echo · 待机')
    const factory = (await load()).default
    const el = document.createElement('div')
    el.className = `echo-theme echo-theme-${id}`
    root.appendChild(el)
    const theme = factory()
    theme.mount(el, ctx)
    mounted = { id, theme, el }
    showIdleLabel(null)
  }

  function apply(incoming: Record<string, OnAir | null>): void {
    raw = incoming
    if (!mounted) return
    const { theme } = mounted
    const next = Object.fromEntries(Object.entries(incoming).map(([k, v]) => [k, withPalette(v)]))
    for (const key of new Set([...Object.keys(slots), ...Object.keys(next)])) {
      const prev = slots[key] ?? null
      const cur = next[key] ?? null
      if (!cur) {
        if (prev) theme.clear(key)
      } else if (!prev || prev.contentId !== cur.contentId || prev.since !== cur.since) {
        theme.show(key, cur)
      } else if (JSON.stringify(prev) !== JSON.stringify(cur)) {
        theme.update(key, cur)
      }
    }
    slots = { ...next }
    if (!Object.values(slots).some(Boolean)) theme.idle?.()
  }

  // Serialized: loading a theme is async, and newer states may arrive meanwhile.
  // Each pass works on the latest state, so a burst collapses into one catch-up.
  async function sync(): Promise<void> {
    if (syncing) return
    syncing = true
    try {
      let seen = -1
      while (latest && latest.rev !== seen) {
        const state = latest
        seen = state.rev
        const s = state.surfaces[surface]
        if ((mounted?.id ?? '') !== (s?.theme ?? '') || !mounted) await mount(s?.theme ?? '')
        apply(s?.slots ?? {})
      }
    } finally {
      syncing = false
    }
  }

  function frame(now: number): void {
    if (mounted) {
      const wall = Date.now()
      const clock: FrameClock = { now, slots: {} }
      for (const [key, onAir] of Object.entries(slots)) {
        const t = onAir ? localTime(onAir, wall) : undefined
        clock.slots[key] = t === undefined ? {} : { t }
      }
      mounted.theme.frame(clock)
    }
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
  showIdleLabel('echo · 待机')

  return {
    render(state) {
      if (state.rev <= rev) return
      rev = state.rev
      latest = state
      void sync()
    },
  }
}
