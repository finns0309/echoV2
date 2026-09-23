import type { AgentCardInput, Block, Presentation, Role } from '@contract'

const STEP_S = 4 // lines appear one after another, this far apart

const ROLE_BY_POSITION: Role[] = ['primary', 'secondary']

// A card becomes a Presentation: lines are revealed in order on a self timeline;
// a status (a value, a progress bar) has no timeline and stays until it's removed
// or expires; a picture shows like a line.
export function present(input: AgentCardInput): Presentation {
  const salience = input.salience ? { salience: input.salience } : {}
  if (input.presentation) {
    const p = input.presentation
    return input.salience ? { ...p, hints: { ...p.hints, ...salience } } : p
  }

  const context: Presentation['context'] = {
    ...(input.title ? { title: input.title } : {}),
    ...(input.byline ? { byline: input.byline } : {}),
    ...(input.speaker ? { speaker: { name: input.speaker } } : {}),
  }
  const hints = (dwell?: number) =>
    dwell || input.salience ? { hints: { ...(dwell ? { dwell } : {}), ...salience } } : {}

  if (input.value || input.progress) {
    return {
      context,
      timeline: { kind: 'none' },
      blocks: [input.value ? { type: 'value', role: 'primary', ...input.value } : { type: 'progress', role: 'primary', ...input.progress! }],
      ...hints(),
    }
  }

  if (input.image) {
    return {
      context,
      timeline: { kind: 'self' },
      blocks: [{ type: 'image', role: 'primary', ...input.image }],
      ...hints(input.dwellSeconds),
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
      ...(l.lang ? { lang: l.lang } : {}),
    }
  })
  return {
    context,
    timeline: { kind: 'self' },
    blocks,
    // Without a dwell, the stage's own rule applies: the last line plus a moment to read it.
    ...hints(input.dwellSeconds),
  }
}
