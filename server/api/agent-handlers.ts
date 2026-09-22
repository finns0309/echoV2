import type { Content, Surface } from '@contract'
import type { ContentStore } from '@server/stage/contents'
import { admits } from '@server/stage/routing'
import { waitingOrder } from '@server/stage/scheduler'
import type { Stage } from '@server/stage/state'
import type { AgentApiHandlers } from './agent-http'

export interface AgentHandlerDeps {
  /** Turn an agent's raw input into content and put it in the store (the card pack). */
  accept: (raw: unknown) => { ok: true; content: Content } | { ok: false; error: string }
  contents: ContentStore
  stage: Stage
}

/** Why a window preference wasn't honoured, in words an agent can pass on. Null when it was, or there was none. */
export function preferenceNote(content: Content, windows: readonly Surface[]): string | null {
  if (!content.window) return null
  const target = windows.find((w) => w.name === content.window)
  if (!target) {
    const names = windows.flatMap((w) => (w.name ? [w.name] : [])).join(', ')
    return `there is no window named ${content.window} (windows: ${names}); it went where it normally would`
  }
  if (target.hidden) return `${content.window} is hidden; it went where it normally would`
  if (!admits(target.accepts, content)) return `${content.window} doesn't take this kind of card (the user's route); it went where it normally would`
  return null
}

/** What the agent API does with each request: submit, withdraw, and the two views. */
export function createAgentHandlers({ accept, contents, stage }: AgentHandlerDeps): AgentApiHandlers {
  return {
    // Accepting runs the scheduler synchronously, so the stage already tells where the card went.
    submit(raw) {
      const before = new Set(contents.list().map((c) => c.id))
      const result = accept(raw)
      if (!result.ok) return result
      const { id, together } = result.content
      const windows = Object.entries(stage.snapshot().surfaces)
      const at = windows.find(([, s]) => Object.values(s.slots).some((slot) => slot?.contentId === id))
      const arrived = together ? contents.list().filter((c) => c.together?.id === together.id).length : 0
      const note = [
        preferenceNote(result.content, windows.map(([, s]) => s)),
        together && !at && arrived < together.of ? `waiting for ${together.of - arrived} more of ensemble ${together.id} before any of it shows` : null,
      ]
        .filter(Boolean)
        .join('; ')
      return {
        ok: true,
        id,
        updated: before.has(id),
        state: at ? 'on-air' : 'queued',
        ...(at ? { surface: at[1].name ?? at[0] } : {}),
        ...(note ? { note } : {}),
      }
    },
    withdraw: (id) => contents.remove(id) || contents.remove(`card:${id}`),
    withdrawGroup: (group) => contents.removeGroup(group),
    // In the order they will go on air.
    contents: () =>
      [...contents.list()].sort(waitingOrder).map((c) => ({
        id: c.id,
        kind: c.kind,
        priority: c.priority,
        title: c.presentation.context.title,
        ...(c.repeat ? { repeat: true } : {}),
        ...(c.group ? { group: c.group } : {}),
      })),
    stage: () => stage.snapshot(),
  }
}
