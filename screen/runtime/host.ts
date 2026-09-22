import type { StageState } from '@contract'

export interface StageHost {
  render(state: StageState): void
}

// The stage host turns stage state into what this screen shows. For now it
// only knows the idle state; mounting themes into slots comes with the first theme.
export function createStageHost(root: HTMLElement, surfaceId: string): StageHost {
  let rev = -1

  return {
    render(state) {
      if (state.rev <= rev) return
      rev = state.rev
      const surface = state.surfaces[surfaceId]
      const occupied = surface ? Object.values(surface.slots).some(Boolean) : false
      root.dataset.state = occupied ? 'on-air' : 'idle'
      root.textContent = occupied ? '' : 'echo · 待机'
    },
  }
}
