// The seam between the screen runtime and themes. Themes import only types
// from here; everything else they need comes from primitives, tokens and the contract.
import type { OnAir, SignalFrame } from '@contract'

export interface ScreenContext {
  /** Which surface this screen renders. */
  surface: string
  /** High-frequency signals (audio energy, onsets). Returns an unsubscribe function. */
  onSignal(listener: (frame: SignalFrame) => void): () => void
}

export interface FrameClock {
  /** performance.now() for this frame. */
  now: number
  /** Local time, in seconds, of whatever sits in each slot (absent for untimed content). */
  slots: Record<string, { t?: number }>
}

export interface Theme {
  mount(root: HTMLElement, ctx: ScreenContext): void
  unmount(): void
  /** New content in a slot. Content-change rituals belong here. */
  show(slot: string, onAir: OnAir): void
  /** Same content, new data: an edit, a media seek, a status value change. */
  update(slot: string, onAir: OnAir): void
  /** The slot emptied. */
  clear(slot: string): void
  frame(clock: FrameClock): void
  /** Every slot is empty: show the idle state. */
  idle?(): void
}

/** Each theme.ts default-exports a factory, so a theme can be mounted fresh. */
export type ThemeFactory = () => Theme
