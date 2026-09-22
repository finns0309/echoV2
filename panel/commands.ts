// What the panel lists, as data: sections, windows, and actions that become
// ShellCommands. Pure, so the whole command surface is testable without a DOM.
import type { ShellCommand, ShellState, ShellWindow } from '@contract'

export type Item =
  | { kind: 'section'; key: string; label: string; count?: number }
  | {
      kind: 'window'
      key: string
      window: string
      label: string
      sub: string
      hint: string
      on: boolean
    }
  | {
      kind: 'action'
      key: string
      label: string
      /** Shown to the right: the current value of a setting. */
      value?: string
      /** A switch: shown as on/off. */
      on?: boolean
      /** Enter runs this. */
      run?: ShellCommand
      /** ←/→ (and Enter, forwards) step through values. */
      step?: (dir: 1 | -1) => ShellCommand | null
      danger?: boolean
      /** Extra words search should match (ids, pinyin, synonyms). */
      words?: string
      /** A one-character mark in the glyph column, where windows show their dot. */
      glyph?: string
    }

export type Selectable = Exclude<Item, { kind: 'section' }>

const at = <T>(list: readonly T[], i: number) => list[((i % list.length) + list.length) % list.length]

function stepper<T extends { id: string }>(list: readonly T[], current: string, make: (next: T) => ShellCommand) {
  return (dir: 1 | -1) => {
    if (list.length < 2) return null
    const next = at(list, list.findIndex((x) => x.id === current) + dir)
    return next ? make(next) : null
  }
}

const label = (list: readonly { id: string; label: string }[], id: string) => list.find((x) => x.id === id)?.label ?? id

/** One line about a window: its theme, and what it takes when there is more than one. */
export function describe(shell: ShellState, w: ShellWindow): string {
  const theme = label(shell.themes, w.theme)
  return shell.windows.length > 1 ? `${theme} · ${label(shell.routes, w.route)}` : theme
}

/** Home: every window, then what can be added or laid out. */
export function homeItems(shell: ShellState, showing: (window: string) => string | null): Item[] {
  return [
    { kind: 'section', key: 's:windows', label: '窗口', count: shell.windows.length },
    ...shell.windows.map(
      (w): Item => ({
        kind: 'window',
        key: `w:${w.id}`,
        window: w.id,
        label: w.name,
        sub: describe(shell, w),
        hint: w.visible ? (showing(w.id) ?? '空闲') : '已隐藏',
        on: w.visible,
      }),
    ),
    { kind: 'section', key: 's:layout', label: '布局' },
    ...layoutActions(shell),
  ]
}

type Action = Extract<Item, { kind: 'action' }>

/**
 * What can be done to one window, once: the settings view shows these as rows;
 * search turns each into commands prefixed with the window's name.
 */
function windowActions(shell: ShellState, w: ShellWindow): Action[] {
  const window = w.id
  const many = shell.windows.length > 1
  const taken = new Set(shell.windows.filter((x) => x.id !== w.id).map((x) => x.name))
  const names = [...new Set([w.name, ...shell.names])].filter((n) => !taken.has(n)).map((n) => ({ id: n }))
  const actions: Action[] = [
    {
      kind: 'action',
      key: 'theme',
      label: '主题',
      value: label(shell.themes, w.theme),
      step: stepper(shell.themes, w.theme, (t) => ({ type: 'setTheme', window, theme: t.id })),
    },
  ]
  if (many) {
    actions.push({
      kind: 'action',
      key: 'route',
      label: '内容',
      value: label(shell.routes, w.route),
      step: stepper(shell.routes, w.route, (r) => ({ type: 'setRoute', window, route: r.id })),
    })
  }
  if (!w.main) {
    actions.push({ kind: 'action', key: 'name', label: '名字', value: w.name, step: stepper(names, w.name, (n) => ({ type: 'rename', window, name: n.id })) })
  }
  actions.push(
    { kind: 'action', key: 'visible', label: '显示', on: w.visible, run: { type: 'toggleVisible', window }, words: 'show hide xianshi yincang 隐藏' },
    { kind: 'action', key: 'click', label: '鼠标穿透', on: w.clickThrough, run: { type: 'toggleClickThrough', window }, words: 'click through chuantou' },
    w.fill === 'full'
      ? { kind: 'action', key: 'fill', label: '铺满屏幕', value: '主题本身就是全屏' }
      : { kind: 'action', key: 'fill', label: '铺满屏幕', on: w.fill === 'restorable', run: { type: 'toggleFill', window }, words: 'fill pumang' },
    { kind: 'action', key: 'reset', label: '重置位置和大小', run: { type: 'resetWindow', window }, words: 'reset chongzhi' },
  )
  if (!w.main) actions.push({ kind: 'action', key: 'close', label: '关闭窗口', run: { type: 'closeWindow', window }, danger: true, words: 'close guanbi' })
  return actions
}

/** Adding a window and the layout presets: on home, and in search. */
function layoutActions(shell: ShellState): Action[] {
  return [
    { kind: 'action', key: 'add', label: '新增窗口', glyph: '+', run: { type: 'addWindow' }, words: 'new add xinzeng' },
    ...shell.presets.map((p): Action => ({ kind: 'action', key: `p:${p.id}`, label: p.label, glyph: '◫', run: { type: 'applyPreset', preset: p.id }, words: `${p.id} 布局 layout` })),
  ]
}

/** A window's settings, one row each. */
export function windowItems(shell: ShellState, id: string): Item[] {
  const w = shell.windows.find((x) => x.id === id)
  return w ? [{ kind: 'section', key: 's:settings', label: '设置' }, ...windowActions(shell, w)] : []
}

/**
 * Everything that can be done, flat, for search: "top 流体", "隐藏 left", "双风铃".
 * A setting with values becomes one command per other value; a switch or action, one command.
 */
export function allActions(shell: ShellState): Selectable[] {
  const out: Selectable[] = []
  for (const w of shell.windows) {
    for (const a of windowActions(shell, w)) {
      const key = `${w.id}:${a.key}`
      if (a.key === 'theme') {
        for (const t of shell.themes) {
          if (t.id !== w.theme) out.push({ kind: 'action', key: `${key}:${t.id}`, label: `${w.name} · 换成${t.label}`, run: { type: 'setTheme', window: w.id, theme: t.id }, words: `theme ${t.id}` })
        }
      } else if (a.key === 'route') {
        for (const r of shell.routes) {
          if (r.id !== w.route) out.push({ kind: 'action', key: `${key}:${r.id}`, label: `${w.name} · ${r.label}`, run: { type: 'setRoute', window: w.id, route: r.id }, words: `route ${r.id}` })
        }
      } else if (a.run) {
        // Show/hide reads as a verb ("隐藏 left"), so it needs no on/off switch beside it.
        const verb = a.key === 'visible'
        const label = verb ? `${w.visible ? '隐藏' : '显示'} ${w.name}` : `${w.name} · ${a.label}`
        out.push({ ...a, key, label, words: `${w.name} ${a.words ?? ''}`, ...(verb ? { on: undefined } : {}) })
      }
    }
  }
  return [...out, ...layoutActions(shell)]
}

/** Every space-separated term must appear, in any order, case-insensitively. */
export function matches(query: string, item: Selectable): boolean {
  const hay = `${item.label} ${'words' in item ? (item.words ?? '') : ''} ${'sub' in item ? item.sub : ''}`.toLowerCase()
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => hay.includes(term))
}

export function searchItems(shell: ShellState, query: string): Item[] {
  const hits = allActions(shell).filter((a) => matches(query, a))
  return [{ kind: 'section', key: 's:results', label: '命令', count: hits.length }, ...hits]
}
