// A small scene for the panel's tests: main (风铃, lyrics only, showing a song) and
// top (流体, agent cards, hidden, click-through).
import type { OnAir, ShellState, StageState, Timeline } from '@contract'
import type { Scene } from './vocabulary'

export const shell: ShellState = {
  windows: [
    { id: 'main', name: 'main', theme: 'furin', route: 'music', visible: true, clickThrough: false, fullScreen: false, loudness: 'attention', main: true },
    { id: 'w2', name: 'top', theme: 'plasma', route: 'card', visible: false, clickThrough: true, fullScreen: false, loudness: 'attention', main: false },
  ],
  themes: [
    { id: 'furin', label: '风铃' },
    { id: 'plasma', label: '流体' },
  ],
  routes: [
    { id: 'all', label: '全部内容' },
    { id: 'music', label: '只放歌词' },
    { id: 'card', label: '只放 agent 投递' },
  ],
  names: ['left', 'top', 'right'],
}

const onAir = (contentId: string, title: string, timeline: Timeline): OnAir => ({ contentId, since: 0, presentation: { context: { title }, timeline, blocks: [] } })
export const song = onAir('music:now', '春愁', { kind: 'media', position: 0, sampledAt: 0, rate: 1, version: 0 })
export const card = onAir('card:a', 'ちょっと休憩', { kind: 'self' })

export const stage: StageState = {
  rev: 1,
  surfaces: {
    main: { profile: 'hanging', theme: 'furin', slots: { main: song } },
    w2: { profile: 'ambient', theme: 'plasma', hidden: true, slots: { main: null } },
  },
}

export const scene: Scene = { shell, stage }

/** The same scene with top showing and holding an agent card, and the stage as given. */
export function busy(paused = false): Scene {
  return {
    shell: { ...shell, windows: shell.windows.map((w) => (w.id === 'w2' ? { ...w, visible: true } : w)) },
    stage: { ...stage, ...(paused ? { paused: true } : {}), surfaces: { ...stage.surfaces, w2: { profile: 'ambient', theme: 'plasma', slots: { main: card } } } },
  }
}
