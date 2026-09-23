// The panel without echo: a fake bridge with sample windows that answers commands,
// for working on the panel in a browser (served by `pnpm dev` at /panel/harness.html).
// Not part of the build.
import '@panel/panel.css'
import { render } from 'preact'
import type { PanelCommand, ShellState, StageState, Timeline } from '@contract'
import type { PanelBridge, ServerToPanel } from '@contract/channels'
import { App } from '@panel/app'
import { createPanelState } from '@panel/state'

const shell: ShellState = {
  windows: [
    { id: 'main', name: 'main', theme: 'furin', route: 'music', visible: true, clickThrough: true, fullScreen: false, loudness: 'attention', main: true },
    { id: 'w2', name: 'top', theme: 'plasma', route: 'card', visible: true, clickThrough: true, fullScreen: false, loudness: 'attention', main: false },
    { id: 'w3', name: 'left', theme: 'plasma', route: 'all', visible: true, clickThrough: false, fullScreen: false, loudness: 'attention', main: false },
    { id: 'w4', name: 'stage', theme: 'tide', route: 'card', visible: false, clickThrough: false, fullScreen: false, loudness: 'attention', main: false },
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
}

const SELF: Timeline = { kind: 'self' }
const MEDIA: Timeline = { kind: 'media', position: 0, sampledAt: 0, rate: 1, version: 0 }
const onAir = (id: string, title: string, timeline: Timeline = SELF) => ({
  main: { contentId: id, since: 0, presentation: { context: { title }, timeline, blocks: [] } },
})
let stage: StageState = {
  rev: 1,
  surfaces: {
    main: { profile: 'hanging', theme: 'furin', slots: onAir('music:now', 'リビングデッド', MEDIA) },
    w2: { profile: 'ambient', theme: 'plasma', slots: onAir('card:a', 'ちょっと休憩') },
    w3: { profile: 'ambient', theme: 'plasma', slots: onAir('card:b', '金曜日の夕方にデプロイ') },
    w4: { profile: 'ambient', theme: 'tide', slots: { main: null } },
  },
}

// Just enough of the shell and the stage to see commands take effect.
function apply(c: PanelCommand): void {
  const empty = (id: string) => {
    const s = stage.surfaces[id]
    if (s?.slots.main?.presentation.timeline.kind === 'self') s.slots.main = null
  }
  if (c.type === 'setPaused') stage = { ...stage, rev: stage.rev + 1, ...(c.on ? { paused: true } : { paused: false }) }
  if (c.type === 'skip' || c.type === 'clear') {
    for (const id of c.type === 'clear' && !c.window ? Object.keys(stage.surfaces) : [c.window!]) empty(id)
    stage = { ...stage, rev: stage.rev + 1 }
  }
  const w = 'window' in c ? shell.windows.find((x) => x.id === c.window) : undefined
  if (c.type === 'setTheme' && w) w.theme = c.theme
  if (c.type === 'setRoute' && w) w.route = c.route
  if (c.type === 'rename' && w) w.name = c.name
  if (c.type === 'setVisible' && w) w.visible = c.on
  if (c.type === 'setClickThrough' && w) w.clickThrough = c.on
  if (c.type === 'setLoudness' && w) w.loudness = c.loudness
  if (c.type === 'setFullScreen' && w) w.fullScreen = c.on
  if (c.type === 'addWindow') {
    const n = shell.windows.length + 1
    shell.windows.push({ id: `w${n}`, name: `win${n}`, theme: c.theme ?? 'furin', route: 'all', visible: true, clickThrough: false, fullScreen: false, loudness: 'attention', main: false })
  }
  if (c.type === 'closeWindow') shell.windows = shell.windows.filter((x) => x.id !== c.window)
  console.log('[harness] command', c)
}

const root = document.getElementById('panel')!

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
      apply(payload as PanelCommand)
      emit('shell', structuredClone(shell))
      emit('stage', structuredClone(stage))
    } else if (channel === 'resize') {
      root.style.height = `${Math.min(640, Math.max(260, payload as number))}px` // as the real window does
    } else console.log('[harness]', channel)
  },
}

render(<App state={createPanelState(bridge)} />, root)
bridge.send('ready', null)
