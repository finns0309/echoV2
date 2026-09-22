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
    { kind: 'action', key: 'add', label: '新增窗口', run: { type: 'addWindow' }, words: 'new add xinzeng' },
    ...shell.presets.map(
      (p): Item => ({ kind: 'action', key: `p:${p.id}`, label: p.label, run: { type: 'applyPreset', preset: p.id }, words: p.id }),
    ),
  ]
}

/** A window's settings, one row each. */
export function windowItems(shell: ShellState, id: string): Item[] {
  const w = shell.windows.find((x) => x.id === id)
  if (!w) return []
  const window = w.id
  const many = shell.windows.length > 1
  const taken = new Set(shell.windows.filter((x) => x.id !== id).map((x) => x.name))
  const names = [...new Set([w.name, ...shell.names])].filter((n) => !taken.has(n)).map((n) => ({ id: n }))
  return [
    { kind: 'section', key: 's:settings', label: w.name },
    {
      kind: 'action',
      key: 'theme',
      label: '主题',
      value: label(shell.themes, w.theme),
      step: stepper(shell.themes, w.theme, (t) => ({ type: 'setTheme', window, theme: t.id })),
    },
    ...(many
      ? [
          {
            kind: 'action' as const,
            key: 'route',
            label: '内容',
            value: label(shell.routes, w.route),
            step: stepper(shell.routes, w.route, (r) => ({ type: 'setRoute', window, route: r.id })),
          },
        ]
      : []),
    ...(!w.main
      ? [
          {
            kind: 'action' as const,
            key: 'name',
            label: '名字',
            value: w.name,
            step: stepper(names, w.name, (n) => ({ type: 'rename', window, name: n.id })),
          },
        ]
      : []),
    { kind: 'action', key: 'visible', label: '显示', on: w.visible, run: { type: 'toggleVisible', window } },
    { kind: 'action', key: 'click', label: '鼠标穿透', on: w.clickThrough, run: { type: 'toggleClickThrough', window } },
    w.fill === 'full'
      ? { kind: 'action', key: 'fill', label: '铺满屏幕', value: '主题本身就是全屏' }
      : { kind: 'action', key: 'fill', label: '铺满屏幕', on: w.fill === 'restorable', run: { type: 'toggleFill', window } },
    { kind: 'action', key: 'reset', label: '重置位置和大小', run: { type: 'resetWindow', window } },
    ...(!w.main ? [{ kind: 'action' as const, key: 'close', label: '关闭窗口', run: { type: 'closeWindow', window } as ShellCommand, danger: true }] : []),
  ]
}

/** Everything that can be done, flat, for search: "top 流体", "隐藏 left", "双风铃". */
export function allActions(shell: ShellState): Selectable[] {
  const out: Selectable[] = []
  const many = shell.windows.length > 1
  for (const w of shell.windows) {
    const window = w.id
    const who = w.name
    for (const t of shell.themes) {
      if (t.id !== w.theme) out.push({ kind: 'action', key: `${window}:t:${t.id}`, label: `${who} · 换成${t.label}`, run: { type: 'setTheme', window, theme: t.id }, words: `theme ${t.id}` })
    }
    if (many) {
      for (const r of shell.routes) {
        if (r.id !== w.route) out.push({ kind: 'action', key: `${window}:r:${r.id}`, label: `${who} · ${r.label}`, run: { type: 'setRoute', window, route: r.id }, words: `route ${r.id}` })
      }
    }
    out.push({ kind: 'action', key: `${window}:v`, label: `${w.visible ? '隐藏' : '显示'} ${who}`, run: { type: 'toggleVisible', window }, words: w.visible ? 'hide yincang' : 'show xianshi' })
    out.push({ kind: 'action', key: `${window}:c`, label: `${who} · 鼠标穿透`, on: w.clickThrough, run: { type: 'toggleClickThrough', window }, words: 'click through chuantou' })
    if (w.fill !== 'full') out.push({ kind: 'action', key: `${window}:f`, label: `${who} · 铺满屏幕`, on: w.fill === 'restorable', run: { type: 'toggleFill', window }, words: 'fill pumang' })
    out.push({ kind: 'action', key: `${window}:reset`, label: `${who} · 重置位置`, run: { type: 'resetWindow', window }, words: 'reset chongzhi' })
    if (!w.main) out.push({ kind: 'action', key: `${window}:close`, label: `关闭 ${who}`, run: { type: 'closeWindow', window }, danger: true, words: 'close guanbi' })
  }
  out.push({ kind: 'action', key: 'add', label: '新增窗口', run: { type: 'addWindow' }, words: 'new add xinzeng' })
  for (const p of shell.presets) out.push({ kind: 'action', key: `p:${p.id}`, label: `布局 · ${p.label}`, run: { type: 'applyPreset', preset: p.id }, words: p.id })
  return out
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
