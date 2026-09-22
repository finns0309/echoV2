import type { StageState, Surface } from '@contract'

// The stage state: what is on which surface right now. The stage service is its
// only writer; screens, the panel and the agent API read it.
export function createStage(surfaces: Record<string, Surface>) {
  let state: StageState = { rev: 0, surfaces }
  const listeners = new Set<(state: StageState) => void>()

  return {
    snapshot(): StageState {
      return state
    },

    update(next: Record<string, Surface>): void {
      state = { rev: state.rev + 1, surfaces: next }
      for (const listener of listeners) listener(state)
    },

    subscribe(listener: (state: StageState) => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export type Stage = ReturnType<typeof createStage>
