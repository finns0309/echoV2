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

export const Surface = z.object({
  profile: z.string().min(1),
  theme: z.string(),
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
  energy: z.number().optional(),
  onset: z.number().optional(),
  centroid: z.number().optional(),
  bands: z.array(z.number()).optional(),
})
export type SignalFrame = z.infer<typeof SignalFrame>
