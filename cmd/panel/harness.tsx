// The panel without echo: a fake bridge with sample windows that answers commands,
// for working on the panel in a browser (served by `pnpm dev` at /panel/harness.html).
// Not part of the build.
import '@panel/panel.css'
import { render } from 'preact'
import type { ShellCommand, ShellState, StageState } from '@contract'
import type { PanelBridge, ServerToPanel } from '@contract/channels'
import { App } from '@panel/app'
import { createPanelState } from '@panel/state'

const shell: ShellState = {
  windows: [
    { id: 'main', name: 'main', theme: 'furin', route: 'music', visible: true, clickThrough: true, fill: 'normal', main: true },
    { id: 'w2', name: 'top', theme: 'plasma', route: 'card', visible: true, clickThrough: true, fill: 'full', main: false },
    { id: 'w3', name: 'left', theme: 'plasma', route: 'all', visible: true, clickThrough: false, fill: 'full', main: false },
    { id: 'w4', name: 'stage', theme: 'tide', route: 'card', visible: false, clickThrough: false, fill: 'full', main: false },
  ],
  themes: [
    { id: 'eva', label: '新世纪' },
    { id: 'furin', label: '风铃' },
    { id: 'plasma', label: '流体' },
    { id: 'tide', label: '夜潮' },
  ],
  routes: [
    { id: 'all', label: '全部内容' },
    { id: 'music', label: '只放歌词' },
    { id: 'card', label: '只放 agent 投递' },
  ],
  names: ['left', 'right', 'top', 'bottom', 'side', 'stage', 'chat', 'corner'],
  presets: [
    { id: 'split', label: '歌词 + agent 双风铃' },
    { id: 'single', label: '只留一个窗口' },
  ],
}

const onAir = (id: string, title: string) => ({
  main: { contentId: id, since: 0, presentation: { context: { title }, timeline: { kind: 'self' as const }, blocks: [] } },
})
const stage: StageState = {
  rev: 1,
  surfaces: {
    main: { profile: 'hanging', theme: 'furin', slots: onAir('music:now', 'リビングデッド') },
    w2: { profile: 'ambient', theme: 'plasma', slots: onAir('card:a', 'ちょっと休憩') },
    w3: { profile: 'ambient', theme: 'plasma', slots: onAir('card:b', '金曜日の夕方にデプロイ') },
    w4: { profile: 'ambient', theme: 'tide', slots: { main: null } },
  },
}

// Just enough of the shell to see commands take effect.
function apply(c: ShellCommand): void {
  const w = 'window' in c ? shell.windows.find((x) => x.id === c.window) : undefined
  if (c.type === 'setTheme' && w) w.theme = c.theme
  if (c.type === 'setRoute' && w) w.route = c.route
  if (c.type === 'rename' && w) w.name = c.name
  if (c.type === 'toggleVisible' && w) w.visible = !w.visible
  if (c.type === 'toggleClickThrough' && w) w.clickThrough = !w.clickThrough
  if (c.type === 'toggleFill' && w && w.fill !== 'full') w.fill = w.fill === 'normal' ? 'restorable' : 'normal'
  if (c.type === 'closeWindow') shell.windows = shell.windows.filter((x) => x.id !== c.window)
  console.log('[harness] command', c)
}

const listeners: { [K in keyof ServerToPanel]?: ((payload: ServerToPanel[K]) => void)[] } = {}
const emit = <K extends keyof ServerToPanel>(channel: K, payload: ServerToPanel[K]) =>
  (listeners[channel] as ((p: ServerToPanel[K]) => void)[] | undefined)?.forEach((l) => l(payload))

const bridge: PanelBridge = {
  on(channel, listener) {
    ;(listeners[channel] ??= []).push(listener as never)
    return () => {}
  },
  send(channel, payload) {
    if (channel === 'ready') {
      emit('shell', structuredClone(shell))
      emit('stage', stage)
    } else if (channel === 'command') {
      apply(payload as ShellCommand)
      emit('shell', structuredClone(shell))
    } else console.log('[harness]', channel)
  },
}

const root = document.getElementById('panel')!
render(<App state={createPanelState(bridge)} />, root)
bridge.send('ready', null)
