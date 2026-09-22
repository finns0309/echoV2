import { AgentCardInput, type Content } from '@contract'
import { present } from './present'

export type AcceptResult = { ok: true; content: Content } | { ok: false; error: string }

// Agent input → Content. Validates at the boundary so nothing malformed reaches the stage.
export function toContent(raw: unknown, now: number, newId: () => string): AcceptResult {
  const parsed = AgentCardInput.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join('.') || 'card'}: ${i.message}`).join('; ') }
  const input = parsed.data
  return {
    ok: true,
    content: {
      id: `card:${input.id ?? newId()}`,
      pack: 'card',
      kind: input.kind ?? (input.value ? 'status' : 'card'),
      // Something kept in rotation shouldn't hold back anything new, so it waits for quiet by default.
      priority: input.priority ?? (input.repeat ? 'ambient' : 'normal'),
      createdAt: now,
      ...(input.ttlSeconds ? { expiresAt: now + input.ttlSeconds * 1000 } : {}),
      ...(input.repeat ? { repeat: true } : {}),
      ...(input.group ? { group: input.group } : {}),
      presentation: present(input),
    },
  }
}
