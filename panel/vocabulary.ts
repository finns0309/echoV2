// Everything the panel can do to echo's windows and what is on them, written once.
// A window's settings rows, fuzzy search and slash commands are three views of this
// table (commands.ts, slash.ts); adding a verb here adds it to all three.
import type { OnAir, PanelCommand, Salience, ShellState, ShellWindow, StageState } from '@contract'

/** What the panel sees: the windows, and what is on them. */
export interface Scene {
  shell: ShellState
  stage: StageState | null
}

export interface Choice {
  id: string
  label: string
}

interface VerbBase {
  /** Its slash command: /theme. */
  slash: string
  /** What the settings row and search call it: 主题. */
  label: string
  /** Extra words search and slash match: pinyin, synonyms. */
  words: string
  /** Whether it makes sense for this window (main can't be renamed or closed). */
  applies(scene: Scene, w: ShellWindow): boolean
  /** False when "all windows" makes no sense for it: names are unique, closing every window is too much. */
  all?: false
}

/** A property with a set of values: theme, what the window takes, its name. */
export interface ChoiceVerb extends VerbBase {
  kind: 'choice'
  /** The argument's name in the usage line: <主题>. */
  arg: string
  choices(scene: Scene, w: ShellWindow): Choice[]
  current(w: ShellWindow): string
  set(w: ShellWindow, id: string): PanelCommand
}

/** An on/off property. `spell` gives it two slash words that set it outright (/show, /hide). */
export interface SwitchVerb extends VerbBase {
  kind: 'switch'
  /** Null when it can't change for this window; `fixed` says why. */
  value(w: ShellWindow): boolean | null
  fixed?: string
  set(w: ShellWindow, on: boolean): PanelCommand
  spell?: { on: { slash: string; label: string }; off: { slash: string; label: string } }
}

/** Something done once: skip, reset, close. */
export interface ActionVerb extends VerbBase {
  kind: 'action'
  run(w: ShellWindow): PanelCommand
  danger?: boolean
  /** What "all windows" means when it is more than doing it to each: clearing everything, waiting or not. */
  everything?: { label: string; run: PanelCommand }
}

export type WindowVerb = ChoiceVerb | SwitchVerb | ActionVerb

const LOUDNESS: readonly (Choice & { id: Salience })[] = [
  { id: 'attention', label: '醒目' },
  { id: 'normal', label: '正常' },
  { id: 'quiet', label: '安静' },
]

const label = (list: readonly Choice[], id: string) => list.find((x) => x.id === id)?.label ?? id
const always = () => true
const notMain = (_: Scene, w: ShellWindow) => !w.main

/** What a window has on air right now. */
export function onAirIn(scene: Scene, window: string): OnAir[] {
  return Object.values(scene.stage?.surfaces[window]?.slots ?? {}).filter((s): s is OnAir => !!s)
}

/** What a window is showing, in a line. */
export function showing(scene: Scene, window: string): string | null {
  const onAir = onAirIn(scene, window)[0]
  if (!onAir) return null
  const { context, blocks } = onAir.presentation
  const first = blocks.find((b) => b.type === 'text')
  return context.title ?? (first?.type === 'text' ? first.text : onAir.contentId)
}

/** Does it show anything the user may skip or clear? Lyrics follow the player, not the user. */
const movable = (scene: Scene, w: ShellWindow) => onAirIn(scene, w.id).some((o) => o.presentation.timeline.kind !== 'media')

/** Names a window can take: its own, or any the others haven't. */
function freeNames({ shell }: Scene, w: ShellWindow): Choice[] {
  const taken = new Set(shell.windows.filter((x) => x.id !== w.id).map((x) => x.name))
  return [...new Set([w.name, ...shell.names])].filter((n) => !taken.has(n)).map((n) => ({ id: n, label: n }))
}

/** In settings-row order. */
export const WINDOW_VERBS: readonly WindowVerb[] = [
  {
    kind: 'choice',
    slash: 'theme',
    label: '主题',
    arg: '主题',
    words: 'zhuti 换',
    applies: always,
    choices: ({ shell }) => shell.themes,
    current: (w) => w.theme,
    set: (w, theme) => ({ type: 'setTheme', window: w.id, theme }),
  },
  {
    kind: 'choice',
    slash: 'route',
    label: '内容',
    arg: '内容',
    words: 'neirong content 路由',
    // With one window there is nothing to route between.
    applies: ({ shell }) => shell.windows.length > 1,
    choices: ({ shell }) => shell.routes,
    current: (w) => w.route,
    set: (w, route) => ({ type: 'setRoute', window: w.id, route }),
  },
  {
    kind: 'choice',
    slash: 'loud',
    label: '醒目上限',
    arg: '程度',
    words: 'xingmu 醒目程度 salience anjing 安静 勿扰',
    applies: always,
    // A ceiling: content louder than this is shown at this level in this window.
    choices: () => [...LOUDNESS],
    current: (w) => w.loudness,
    set: (w, loudness) => ({ type: 'setLoudness', window: w.id, loudness: LOUDNESS.find((c) => c.id === loudness)?.id ?? 'attention' }),
  },
  {
    kind: 'action',
    slash: 'skip',
    label: '跳过当前',
    words: 'tiaoguo next 下一张 切换',
    applies: movable,
    run: (w) => ({ type: 'skip', window: w.id }),
  },
  {
    kind: 'action',
    slash: 'clear',
    label: '撤下当前',
    words: 'chexia qingkong 清空 撤掉 清除',
    applies: movable,
    run: (w) => ({ type: 'clear', window: w.id }),
    everything: { label: '撤下全部卡片（包括排队中的）', run: { type: 'clear' } },
  },
  {
    kind: 'choice',
    slash: 'name',
    label: '名字',
    arg: '名字',
    words: 'mingzi rename 改名',
    applies: notMain,
    all: false,
    choices: freeNames,
    current: (w) => w.name,
    set: (w, name) => ({ type: 'rename', window: w.id, name }),
  },
  {
    kind: 'switch',
    slash: 'visible',
    label: '显示',
    words: 'xianshi yincang show hide',
    applies: always,
    value: (w) => w.visible,
    set: (w, on) => ({ type: 'setVisible', window: w.id, on }),
    spell: { on: { slash: 'show', label: '显示' }, off: { slash: 'hide', label: '隐藏' } },
  },
  {
    kind: 'switch',
    slash: 'click',
    label: '鼠标穿透',
    words: 'chuantou click through',
    applies: always,
    value: (w) => w.clickThrough,
    set: (w, on) => ({ type: 'setClickThrough', window: w.id, on }),
  },
  {
    kind: 'switch',
    slash: 'fill',
    label: '铺满屏幕',
    words: 'pumang fullscreen',
    applies: always,
    value: (w) => (w.fill === 'full' ? null : w.fill === 'restorable'),
    fixed: '主题本身就是全屏',
    set: (w, on) => ({ type: 'setFill', window: w.id, on }),
  },
  {
    kind: 'action',
    slash: 'reset',
    label: '重置位置和大小',
    words: 'chongzhi',
    applies: always,
    run: (w) => ({ type: 'resetWindow', window: w.id }),
  },
  {
    kind: 'action',
    slash: 'close',
    label: '关闭窗口',
    words: 'guanbi 删除',
    applies: notMain,
    all: false,
    run: (w) => ({ type: 'closeWindow', window: w.id }),
    danger: true,
  },
]

/** The verbs that aren't about one window. */
export const NEW_WINDOW = {
  slash: 'new',
  label: '新增窗口',
  words: 'xinzeng add 新建',
  run: (theme?: string): PanelCommand => ({ type: 'addWindow', ...(theme ? { theme } : {}) }),
}

/** Hold everything on screen where it is: nothing ends or is pushed aside until resumed. */
export const PAUSE = {
  label: '暂停轮播',
  words: 'zanting lunbo pause hold 继续 jixu resume',
  value: (scene: Scene) => !!scene.stage?.paused,
  set: (on: boolean): PanelCommand => ({ type: 'setPaused', on }),
  spell: { on: { slash: 'pause', label: '暂停轮播' }, off: { slash: 'resume', label: '继续轮播' } },
}

/** The command that sets a switch, as a line: "隐藏 left", "left · 打开鼠标穿透". */
export function switchLine(v: SwitchVerb, w: ShellWindow, on: boolean): string {
  if (v.spell) return `${on ? v.spell.on.label : v.spell.off.label} ${w.name}`
  return `${w.name} · ${on ? '打开' : '关闭'}${v.label}`
}

/** One line about a window: its theme, and what it takes when there is more than one. */
export function describe(shell: ShellState, w: ShellWindow): string {
  const theme = label(shell.themes, w.theme)
  return shell.windows.length > 1 ? `${theme} · ${label(shell.routes, w.route)}` : theme
}

export { label as choiceLabel }
