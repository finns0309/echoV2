// Content and Presentation — the shape every source is translated into.
// Human-readable spec: docs/CONTRACT.md §3.1–3.4. Types are inferred from the
// schemas; never hand-write a parallel type.
import { z } from 'zod'

export const Role = z.enum(['primary', 'secondary', 'annotation', 'attribution'])
export type Role = z.infer<typeof Role>

const seconds = z.number().nonnegative()

export const TextBlock = z.object({
  type: z.literal('text'),
  role: Role,
  text: z.string().min(1),
  at: seconds.optional(),
  until: seconds.optional(),
  emphasis: z.string().min(1).optional(),
  reading: z.string().min(1).optional(),
  lang: z.string().min(1).optional(),
  short: z.string().min(1).optional(),
  timing: z.array(z.object({ at: seconds, len: z.number().int().positive() })).optional(),
})

export const ValueBlock = z.object({
  type: z.literal('value'),
  role: Role,
  value: z.union([z.number(), z.string()]),
  unit: z.string().optional(),
  label: z.string().optional(),
  delta: z.number().optional(),
})

export const ProgressBlock = z.object({
  type: z.literal('progress'),
  role: Role,
  value: z.number(),
  max: z.number().positive(),
  label: z.string().optional(),
})

export const ImageBlock = z.object({
  type: z.literal('image'),
  role: Role,
  src: z.string().min(1),
  alt: z.string().optional(),
})

export const Block = z.discriminatedUnion('type', [TextBlock, ValueBlock, ProgressBlock, ImageBlock])
export type Block = z.infer<typeof Block>
export type BlockType = Block['type']
export const BLOCK_TYPES = ['text', 'value', 'progress', 'image'] as const satisfies readonly BlockType[]

export const Timeline = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('media'), position: seconds, sampledAt: z.number(), rate: z.number(), version: z.number().int() }),
  z.object({ kind: z.literal('self') }),
  z.object({ kind: z.literal('wall'), start: z.number().optional(), end: z.number().optional() }),
  z.object({ kind: z.literal('none') }),
])
export type Timeline = z.infer<typeof Timeline>
export type TimelineKind = Timeline['kind']
export const TIMELINE_KINDS = ['media', 'self', 'wall', 'none'] as const satisfies readonly TimelineKind[]

export const PresentationContext = z.object({
  title: z.string().optional(),
  byline: z.string().optional(),
  art: z.string().optional(),
  palette: z.array(z.string()).optional(),
  speaker: z.object({ name: z.string().min(1), avatar: z.string().optional() }).optional(),
})

/** How much a content should ask for the eye: themes express it in their own way. */
export const Salience = z.enum(['quiet', 'normal', 'attention'])
export type Salience = z.infer<typeof Salience>

export const Hints = z.object({
  dwell: z.number().positive().optional(),
  salience: Salience.optional(),
  breaks: z.array(z.object({ at: seconds, until: seconds })).optional(),
})

export const Presentation = z
  .object({
    context: PresentationContext,
    timeline: Timeline,
    blocks: z.array(Block).min(1),
    hints: Hints.optional(),
    ext: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((p, ctx) => {
    p.blocks.forEach((b, i) => {
      if (b.type === 'text' && b.emphasis && !b.text.includes(b.emphasis)) {
        ctx.addIssue({ code: 'custom', path: ['blocks', i, 'emphasis'], message: 'emphasis must be a substring of text' })
      }
    })
  })
export type Presentation = z.infer<typeof Presentation>

export const Priority = z.enum(['ambient', 'normal', 'urgent'])
export type Priority = z.infer<typeof Priority>

export const Content = z.object({
  id: z.string().min(1),
  pack: z.string().min(1),
  kind: z.string().min(1),
  priority: Priority,
  createdAt: z.number().int(),
  expiresAt: z.number().int().optional(),
  /** When its run completes, go back to the end of the line instead of being consumed. */
  repeat: z.boolean().optional(),
  /** A batch this content was sent with; the whole batch can be withdrawn at once. */
  group: z.string().min(1).optional(),
  /** Preferred window, by name. Honoured only if that window is visible and its route admits this content. */
  window: z.string().min(1).optional(),
  /**
   * An ensemble: the `of` contents sharing this id go on air together, in the same
   * pass with the same start, or not at all. `of` lets it wait for members still on their way.
   */
  together: z.object({ id: z.string().min(1), of: z.number().int().min(1).max(8) }).optional(),
  presentation: Presentation,
})
export type Content = z.infer<typeof Content>
