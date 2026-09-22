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
