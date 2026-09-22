import type { AgentCardInput, Block, Presentation, Role } from '@contract'

const STEP_S = 4 // lines appear one after another, this far apart
const TAIL_S = 6 // and the card lingers this long after the last one

const ROLE_BY_POSITION: Role[] = ['primary', 'secondary']

// A card becomes a Presentation: lines are revealed in order on a self timeline;
// a status value has no timeline and stays until it's removed or expires.
export function present(input: AgentCardInput): Presentation {
  if (input.presentation) return input.presentation

  const context: Presentation['context'] = {
    ...(input.title ? { title: input.title } : {}),
    ...(input.byline ? { byline: input.byline } : {}),
    ...(input.speaker ? { speaker: { name: input.speaker } } : {}),
  }

  if (input.value) {
    return {
      context,
      timeline: { kind: 'none' },
      blocks: [{ type: 'value', role: 'primary', ...input.value }],
    }
  }

  const blocks: Block[] = (input.lines ?? []).map((line, i) => {
    const l = typeof line === 'string' ? { text: line } : line
    return {
      type: 'text',
      role: l.role ?? ROLE_BY_POSITION[i] ?? 'annotation',
      text: l.text,
      at: l.at ?? i * STEP_S,
      ...(l.reading ? { reading: l.reading } : {}),
      ...(l.emphasis && l.text.includes(l.emphasis) ? { emphasis: l.emphasis } : {}),
      ...(l.short ? { short: l.short } : {}),
    }
  })
  const last = Math.max(0, ...blocks.map((b) => (b.type === 'text' ? (b.at ?? 0) : 0)))

  return {
    context,
    timeline: { kind: 'self' },
    blocks,
    hints: { dwell: input.dwellSeconds ?? last + TAIL_S },
  }
}
