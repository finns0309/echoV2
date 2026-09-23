// A small shell for the panel's tests: main (风铃, lyrics only) and top (流体,
// agent cards, hidden, click-through, a full-screen theme).
import type { ShellState } from '@contract'

export const shell: ShellState = {
  windows: [
    { id: 'main', name: 'main', theme: 'furin', route: 'music', visible: true, clickThrough: false, fill: 'normal', main: true },
    { id: 'w2', name: 'top', theme: 'plasma', route: 'card', visible: false, clickThrough: true, fill: 'full', main: false },
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
