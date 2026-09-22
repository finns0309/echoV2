// What an agent sends to echo (POST /contents, the MCP `show` tool).
// Friendlier than a raw Content: agents describe a card, the card pack turns it
// into a Presentation. `presentation` is the escape hatch for full control.
import { z } from 'zod'
import { Presentation, Priority, Role } from './content'

export const CardLine = z.union([
  z.string().min(1),
  z.object({
    text: z.string().min(1),
    role: Role.optional(),
    reading: z.string().min(1).optional().describe('Pronunciation shown as ruby, e.g. めぐりあう for 巡り合う'),
    emphasis: z.string().min(1).optional().describe('A substring of text to highlight'),
    short: z.string().min(1).optional().describe('A short form for small themes'),
    at: z.number().nonnegative().optional().describe('Seconds after the card appears'),
  }),
])
export type CardLine = z.infer<typeof CardLine>

export const AgentCardInput = z
  .object({
    id: z.string().min(1).max(120).optional().describe('Stable id; sending the same id again updates the card in place'),
    kind: z.string().min(1).max(40).optional().describe('What this is, e.g. word, fact, news, message, status'),
    priority: Priority.optional().describe('ambient: only when idle; normal: default; urgent: interrupts'),
    ttlSeconds: z.number().positive().optional().describe('Remove the card after this many seconds'),
    title: z.string().optional(),
    byline: z.string().optional(),
    speaker: z.string().optional().describe('Who is talking, e.g. Claude'),
    lines: z.array(CardLine).min(1).max(12).optional().describe('Shown in order; first is primary'),
    value: z
      .object({ value: z.union([z.number(), z.string()]), unit: z.string().optional(), label: z.string().optional() })
      .optional()
      .describe('A status value instead of lines; stays until removed or expired'),
    dwellSeconds: z.number().positive().max(600).optional().describe('How long the card stays on screen'),
    presentation: Presentation.optional().describe('Full control; overrides lines and value'),
  })
  .refine((c) => c.lines || c.value || c.presentation, { message: 'send lines, value or presentation' })
export type AgentCardInput = z.infer<typeof AgentCardInput>
