// Stage state and signals — what the display server pushes to every screen.
// Spec: docs/CONTRACT.md §3.6. The display server is the only writer.
import { z } from 'zod'
import { Presentation } from './content'

export const OnAir = z.object({
  contentId: z.string().min(1),
  presentation: Presentation,
  since: z.number(),
  directions: z.unknown().optional(),
})
export type OnAir = z.infer<typeof OnAir>

/**
 * What a surface takes. Absent lists mean "any"; both present means both must match.
 * A surface with no route takes everything.
 */
export const Route = z.object({
  packs: z.array(z.string().min(1)).optional(),
  kinds: z.array(z.string().min(1)).optional(),
})
export type Route = z.infer<typeof Route>

export const Surface = z.object({
  /** The user's name for this window (main, left, right, ...); what agents use to prefer it. */
  name: z.string().min(1).optional(),
  profile: z.string().min(1),
  theme: z.string(),
  accepts: Route.optional(),
  /** Also takes whatever no visible surface's route admits. */
  fallback: z.boolean().optional(),
  /** Hidden by the user: gets nothing, and what it held goes elsewhere. */
  hidden: z.boolean().optional(),
  slots: z.record(z.string(), OnAir.nullable()),
})
export type Surface = z.infer<typeof Surface>

export const StageState = z.object({
  rev: z.number().int().nonnegative(),
  surfaces: z.record(z.string(), Surface),
})
export type StageState = z.infer<typeof StageState>

// High-frequency (~30fps). Never folded into StageState.
export const SignalFrame = z.object({
  t: z.number(),
  /** The content these signals belong to; screens not showing it ignore them. Absent: everyone. */
  source: z.string().optional(),
  energy: z.number().optional(),
  onset: z.number().optional(),
  centroid: z.number().optional(),
  bands: z.array(z.number()).optional(),
})
export type SignalFrame = z.infer<typeof SignalFrame>
