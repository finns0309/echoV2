// A theme without echo: a fake bridge that puts sample content on a window-sized
// stage, for working on themes in a browser (served by `pnpm dev` at
// /screen/harness.html). Not part of the build.
import '@screen/tokens/base.css'
import type { Block, OnAir, Presentation, Salience, ScreenBridge, ServerToScreen, SignalFrame, StageState, ThemeManifest } from '@contract'
import { createStageHost } from '@screen/runtime/host'
import type { ThemeFactory } from '@screen/runtime/theme-api'

const themes: Record<string, () => Promise<{ default: ThemeFactory }>> = {}
for (const [path, load] of Object.entries(import.meta.glob<{ default: ThemeFactory }>('../../screen/themes/*/theme.ts'))) {
  const id = path.split('/').at(-2)
  if (id) themes[id] = load
}
const manifests: Record<string, ThemeManifest> = {}
for (const [path, mod] of Object.entries(import.meta.glob<{ default: ThemeManifest }>('../../screen/themes/*/manifest.ts', { eager: true }))) {
  const id = path.split('/').at(-2)
  if (id) manifests[id] = mod.default
}
// The size each theme's window profile gives it (hanging 300×470; ambient, a laptop-ish screen).
const SIZE: Record<string, [number, number]> = { furin: [300, 470], duo: [760, 560], claude: [760, 560] }
const AMBIENT: [number, number] = [980, 600]

function picture(): string {
  const c = document.createElement('canvas')
  c.width = 800
  c.height = 500
  const x = c.getContext('2d')!
  const g = x.createLinearGradient(0, 0, 0, 500)
  g.addColorStop(0, '#3b2a6b')
  g.addColorStop(0.55, '#f08a5d')
  g.addColorStop(1, '#f9d56e')
  x.fillStyle = g
  x.fillRect(0, 0, 800, 500)
  x.fillStyle = '#fff6'
  x.beginPath()
  x.arc(560, 330, 70, 0, Math.PI * 2)
  x.fill()
  return c.toDataURL('image/png')
}

const text = (t: string, at: number, extra: Partial<Extract<Block, { type: 'text' }>> = {}): Block => ({ type: 'text', role: at ? 'secondary' : 'primary', text: t, at, ...extra })
let value = 42.3
let progress = 3

const SAMPLES: Record<string, () => Presentation> = {
  '单词（日）': () => ({
    context: { title: '今日の単語', palette: ['#6eb5ff'] },
    timeline: { kind: 'self' },
    blocks: [text('巡り合う', 0, { reading: 'めぐりあう' }), text('偶然相遇；邂逅', 4), text('また巡り合えたね', 8)],
  }),
  '碎碎念（日）': () => ({ context: { palette: ['#ff8fb1'] }, timeline: { kind: 'self' }, blocks: [text('今日もおつかれ (´･ω･`)', 0), text('直す前に骨休め', 4)] }),
  中文: () => ({ context: { palette: ['#7bd88f'] }, timeline: { kind: 'self' }, blocks: [text('从树叶间洒下的阳光', 0), text('今天也辛苦了', 4)] }),
  English: () => ({ context: {}, timeline: { kind: 'self' }, blocks: [text('Tests all green. Ship it?', 0)] }),
  数值: () => ({ context: { palette: ['#f9d56e'] }, timeline: { kind: 'none' }, blocks: [{ type: 'value', role: 'primary', value, unit: 'MB', label: '缓存', delta: 1.8 }] }),
  进度: () => ({ context: { palette: ['#6eb5ff'] }, timeline: { kind: 'none' }, blocks: [{ type: 'progress', role: 'primary', value: progress, max: 10, label: '打包' }] }),
  图片: () => ({ context: { palette: ['#f08a5d'] }, timeline: { kind: 'self' }, blocks: [{ type: 'image', role: 'primary', src: picture(), alt: '夕焼け' }] }),
}

// A morning's worth of stories, for themes with a page of slots.
const MORNING: Presentation[] = [
  {
    context: { title: 'モデル', palette: ['#D97757'] },
    timeline: { kind: 'self' },
    blocks: [
      text('Anthropic、Claude Opus 5.5 を公開', 0),
      { type: 'value', role: 'secondary', value: '$4 / $20', label: '入力 / 出力（100万トークン）・約40% 安く' },
      text('……このカードを書いてるのも、それ (´∀｀)ゞ', 5, { role: 'annotation', emphasis: 'それ' }),
      text('AI Weekly ・ 9/23', 5, { role: 'attribution' }),
    ],
  },
  {
    context: { title: 'セキュリティ', palette: ['#AB47BC'] },
    timeline: { kind: 'self' },
    blocks: [
      text('初の「完全自律型AIマルウェア」を報告', 0, { emphasis: '完全自律型' }),
      text('Cisco Talos が CLOSEDQUORUM を公表。複数モデルで動く遠隔操作のインプラント', 3),
      text('検知ツール CAIRN も同時公開', 7, { role: 'annotation' }),
      text('AI Weekly ・ 9/23', 7, { role: 'attribution' }),
    ],
  },
  {
    context: { title: '2026年', palette: ['#FF7043'] },
    timeline: { kind: 'self' },
    blocks: [
      { type: 'progress', role: 'primary', value: 265.4, max: 365, label: '今年も 72.7% 過ぎた' },
      { type: 'value', role: 'secondary', value: 89, unit: '日', label: '冬至まで' },
      text('水曜日。週の真ん中 (˘ω˘)', 4, { role: 'annotation' }),
    ],
  },
  {
    context: { title: '今日の言葉', palette: ['#C0392B'] },
    timeline: { kind: 'self' },
    blocks: [text('暑さ寒さも彼岸まで', 0, { reading: 'あつささむさもひがんまで' }), text('秋分を挟む七日間が「秋のお彼岸」', 4), text('残暑も、そろそろおしまい', 8, { role: 'annotation' })],
  },
  {
    context: { title: '国際', palette: ['#42A5F5'] },
    timeline: { kind: 'self' },
    blocks: [
      text('国連安保理で、AIと国際安全保障を議論', 0),
      text('OpenAI・Anthropic・DeepSeek・Moonshot が同じ席に', 3),
      text('フランスが主催', 6, { role: 'annotation' }),
      text('AI Weekly ・ 9/23', 6, { role: 'attribution' }),
    ],
  },
]
const VERSE = ['まだ知らないよ', '向き合っているこの寂しさに', '意味はあるの？', '生きているそれだけでさ', '風に吹かれるままゆらゆらり', 'これからの時間の煌めきに']
function playing(): Presentation {
  return {
    context: { title: '空中散歩', byline: 'CIEL', art: picture() },
    timeline: { kind: 'media', position: 0, sampledAt: playedFrom, rate: 1, version: 1 },
    blocks: VERSE.map((t, i) => ({ type: 'text', role: 'primary', text: t, at: 1 + i * 3.5 })),
    hints: { breaks: [{ at: 1 + VERSE.length * 3.5, until: 1 + VERSE.length * 3.5 + 4 }] },
  }
}
let playedFrom = Date.now()
let turn = 0 // which morning story each column starts from

// — the fake bridge —
const listeners: { [K in keyof ServerToScreen]?: ((p: ServerToScreen[K]) => void)[] } = {}
const bridge: ScreenBridge = {
  on(channel, listener) {
    ;(listeners[channel] ??= []).push(listener as never)
    return () => {}
  },
  send() {},
}
const emit = <K extends keyof ServerToScreen>(c: K, p: ServerToScreen[K]) => listeners[c]?.forEach((l) => (l as (x: typeof p) => void)(p))

// — controls —
const params = new URLSearchParams(location.search)
const state = {
  theme: params.get('theme') ?? 'plasma',
  sample: params.get('sample') ?? '单词（日）',
  salience: (params.get('salience') ?? 'normal') as Salience,
  music: params.get('music') === '1',
  // Something playing, for themes with a slot for it (Duo's cover art, the gazette's poem).
  playing: params.get('playing') !== '0',
}
let rev = 0
let since = Date.now()

const frame = document.getElementById('frame')!
const stage = document.getElementById('stage')!
const host = createStageHost({ root: stage, surface: 'h', themes, bridge })
bridge.on('stage', (s) => host.render(s))
bridge.on('highlight', (t) => host.highlight(t))
let located = false

/** 清空 takes the cards off; what plays stays, as the 在放歌 switch says. Anything else puts them back. */
let cleared = false

function publish(fresh: boolean, clear = false): void {
  cleared = clear
  if (fresh) since = Date.now()
  const [w, h] = SIZE[state.theme] ?? AMBIENT
  frame.style.width = `${w}px`
  frame.style.height = `${h}px`
  const onAir: OnAir = { contentId: `sample:${state.sample}`, since, salience: state.salience, presentation: SAMPLES[state.sample]!() }
  // A page of slots: the sample leads, the morning fills the rest, and anything that
  // plays along with media gets a song that keeps going round.
  // As the scheduler would: the sample goes to the first slot that takes its timeline.
  const slots: Record<string, OnAir | null> = {}
  let morning = 0
  let placed = false
  for (const [name, spec] of Object.entries(manifests[state.theme]?.slots ?? { main: null })) {
    if (spec && !spec.timelines.some((k) => k !== 'media')) {
      if (Date.now() - playedFrom > 30_000) playedFrom = Date.now()
      slots[name] = state.playing ? { contentId: 'sample:verse', since: playedFrom, presentation: playing() } : null
    } else if (cleared) slots[name] = null
    else if (!placed && (!spec || spec.timelines.includes(onAir.presentation.timeline.kind))) {
      slots[name] = onAir
      placed = true
    } else if (spec && !spec.timelines.includes('self')) slots[name] = null
    else {
      const i = (turn + morning++) % MORNING.length
      slots[name] = { contentId: `morning:${i}`, since, salience: 'normal', presentation: MORNING[i]! }
    }
  }
  const s: StageState = { rev: ++rev, surfaces: { h: { profile: 'x', theme: state.theme, slots } } }
  emit('stage', s)
  history.replaceState(null, '', `?${new URLSearchParams({ theme: state.theme, sample: state.sample, salience: state.salience, music: state.music ? '1' : '0', playing: state.playing ? '1' : '0' })}`)
}

function select(label: string, options: string[], key: 'theme' | 'sample' | 'salience'): HTMLElement {
  const l = document.createElement('label')
  l.textContent = label
  const s = document.createElement('select')
  for (const o of options) s.add(new Option(o, o, false, o === state[key]))
  s.onchange = () => {
    ;(state as Record<string, unknown>)[key] = s.value
    publish(true)
  }
  l.append(s)
  return l
}
function button(label: string, run: () => void): HTMLElement {
  const b = document.createElement('button')
  b.textContent = label
  b.onclick = run
  return b
}
const bar = document.getElementById('bar')!
bar.append(
  select('主题', Object.keys(themes), 'theme'),
  select('内容', Object.keys(SAMPLES), 'sample'),
  select('醒目', ['quiet', 'normal', 'attention'], 'salience'),
  button('重播', () => publish(true)),
  button('数值变化', () => {
    value = Math.round((value + (Math.random() * 40 - 12)) * 10) / 10
    publish(false)
  }),
  button('进度 +1', () => {
    progress = progress >= 10 ? 0 : progress + 1
    publish(false)
  }),
  button('换稿', () => {
    turn++
    publish(false)
  }),
  button('清空', () => publish(false, true)),
  button('定位', () => {
    located = !located
    emit('highlight', located ? { surface: 'h', name: 'top' } : null)
  }),
)
const music = document.createElement('label')
const box = document.createElement('input')
box.type = 'checkbox'
box.checked = state.music
box.onchange = () => (state.music = box.checked)
music.append(box, '音乐信号')
const play = document.createElement('label')
const playBox = document.createElement('input')
playBox.type = 'checkbox'
playBox.checked = state.playing
playBox.onchange = () => {
  state.playing = playBox.checked
  publish(false, cleared)
}
play.append(playBox, '在放歌')
bar.append(music, play)

// A pretend song: a slow swell with a beat every ~0.5s.
setInterval(() => {
  if (!state.music) return
  const t = performance.now() / 1000
  const frame: SignalFrame = { t, energy: 0.12 + 0.1 * Math.sin(t * 0.7) ** 2, ...(Math.sin(t * 12.5) > 0.97 ? { onset: 0.7, centroid: 0.5 } : {}) }
  emit('signal', frame)
}, 33)

publish(true)
