// Theme manifests — the pure-data half of a theme that the display server
// reads to schedule. Spec: docs/CONTRACT.md §3.5 and §4.2. The behavioral
// Theme interface lives in screen/runtime (it needs DOM types).
import { z } from 'zod'
import { BLOCK_TYPES, TIMELINE_KINDS } from './content'

export const SlotSpec = z.object({
  accepts: z.array(z.enum(BLOCK_TYPES)).min(1),
  timelines: z.array(z.enum(TIMELINE_KINDS)).min(1),
  kinds: z.array(z.string().min(1)).optional(),
  role: z.enum(['main', 'side', 'ambient']),
  maxChars: z.number().int().positive().optional(),
})
export type SlotSpec = z.infer<typeof SlotSpec>

export const SIGNALS = ['energy', 'onset', 'daylight', 'palette'] as const

export const ThemeManifest = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  label: z.string().min(1),
  window: z.string().min(1),
  slots: z.record(z.string(), SlotSpec),
  signals: z.array(z.enum(SIGNALS)).optional(),
})
export type ThemeManifest = z.infer<typeof ThemeManifest>

/**
 * A theme's director grammar (screen/themes/<id>/grammar.ts): how to ask an LLM
 * to stage a presentation for this theme, and how to read the answer back.
 * Pure functions only: the display server loads this file.
 */
export interface Grammar {
  /** Bump when the prompt or output format changes; old cache entries are then ignored. */
  version: number
  instructions: string
  /** The model input for one presentation, plus a stable cache key. Null means "nothing to direct". */
  prepare(presentation: import('./content').Presentation): { input: string; key: string } | null
  /** Model output → directions for OnAir.directions. Null when the output is unusable. */
  parse(output: string, presentation: import('./content').Presentation): unknown
}
