// What the panel lists, as data. The home list, a window's settings and fuzzy
// search are views of the vocabulary (vocabulary.ts); slash commands are another
// (slash.ts). Pure, so the whole command surface is testable without a DOM.
import type { ShellCommand, ShellState, ShellWindow } from '@contract'
import { NEW_WINDOW, WINDOW_VERBS, choiceLabel, describe, switchLine, type WindowVerb } from './vocabulary'

export type Item =
  | { kind: 'section'; key: string; label: string; count?: number }
  /** A line that can't be picked: why there is nothing to pick. */
  | { kind: 'note'; key: string; label: string }
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
      /** Muted, right after the label. */
      sub?: string
      /** Shown to the right: the current value of a setting, or a command's usage. */
      value?: string
      /** A switch: shown as on/off. */
      on?: boolean
      /** Enter runs this. */
      run?: ShellCommand
      /** ←/→ (and Enter, forwards) step through values. */
      step?: (dir: 1 | -1) => ShellCommand | null
      /** Enter (or ⇥) puts this in the input instead: completing a slash command. */
      fill?: string
      danger?: boolean
      /** Extra words search should match (ids, pinyin, synonyms). */
      words?: string
      /** A one-character mark in the glyph column, where windows show their dot. */
      glyph?: string
    }

export type Selectable = Exclude<Item, { kind: 'section' | 'note' }>
export type Action = Extract<Item, { kind: 'action' }>

const at = <T>(list: readonly T[], i: number) => list[((i % list.length) + list.length) % list.length]

function windowRow(shell: ShellState, w: ShellWindow, showing: (window: string) => string | null): Item {
  return {
    kind: 'window',
    key: `w:${w.id}`,
    window: w.id,
    label: w.name,
    sub: describe(shell, w),
    hint: w.visible ? (showing(w.id) ?? '空闲') : '已隐藏',
    on: w.visible,
  }
}

const newWindowRow: Action = { kind: 'action', key: 'new', label: NEW_WINDOW.label, glyph: '+', run: NEW_WINDOW.run(), words: `${NEW_WINDOW.words} new` }

/** Home: every window, and a way to add one. */
export function homeItems(shell: ShellState, showing: (window: string) => string | null): Item[] {
  return [
    { kind: 'section', key: 's:windows', label: '窗口', count: shell.windows.length },
    ...shell.windows.map((w) => windowRow(shell, w, showing)),
    newWindowRow,
  ]
}

/** One settings row for a verb: a stepper, a switch, or an action. */
function settingRow(shell: ShellState, w: ShellWindow, v: WindowVerb): Action {
  const key = v.slash
  switch (v.kind) {
    case 'choice': {
      const choices = v.choices(shell, w)
      const current = v.current(w)
      return {
        kind: 'action',
        key,
        label: v.label,
        value: choiceLabel(choices, current),
        step: (dir) => {
          if (choices.length < 2) return null
          const next = at(choices, choices.findIndex((c) => c.id === current) + dir)
          return next ? v.set(w, next.id) : null
        },
      }
    }
    case 'switch': {
      const on = v.value(w)
      return on === null
        ? { kind: 'action', key, label: v.label, value: v.fixed }
        : { kind: 'action', key, label: v.label, on, run: v.set(w, !on) }
    }
    case 'action':
      return { kind: 'action', key, label: v.label, run: v.run(w), ...(v.danger ? { danger: true } : {}) }
  }
}

/** A window's settings, one row per verb that applies to it. */
export function windowItems(shell: ShellState, id: string): Item[] {
  const w = shell.windows.find((x) => x.id === id)
  if (!w) return []
  return [
    { kind: 'section', key: 's:settings', label: '设置' },
    ...WINDOW_VERBS.filter((v) => v.applies(shell, w)).map((v) => settingRow(shell, w, v)),
  ]
}

/** What a verb can do to a window, flattened into commands: one per other value, or the flip of a switch. */
function commandsFor(shell: ShellState, w: ShellWindow, v: WindowVerb): Action[] {
  const key = `${w.id}:${v.slash}`
  const words = `${w.name} ${v.slash} ${v.words}`
  switch (v.kind) {
    case 'choice':
      return v
        .choices(shell, w)
        .filter((c) => c.id !== v.current(w))
        .map((c) => ({ kind: 'action', key: `${key}:${c.id}`, label: `${w.name} · ${v.label}换成${c.label}`, run: v.set(w, c.id), words: `${words} ${c.id}` }))
    case 'switch': {
      const on = v.value(w)
      return on === null ? [] : [{ kind: 'action', key, label: switchLine(v, w, !on), run: v.set(w, !on), words }]
    }
    case 'action':
      return [{ kind: 'action', key, label: `${w.name} · ${v.label}`, run: v.run(w), words, ...(v.danger ? { danger: true } : {}) }]
  }
}

/** Everything that can be done, flat: "top 流体", "隐藏 left", "新增". Windows too, to open them. */
export function allCommands(shell: ShellState, showing: (window: string) => string | null): Selectable[] {
  const out: Selectable[] = []
  for (const w of shell.windows) {
    out.push(windowRow(shell, w, showing) as Selectable)
    for (const v of WINDOW_VERBS) if (v.applies(shell, w)) out.push(...commandsFor(shell, w, v))
  }
  out.push(newWindowRow)
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

export function searchItems(shell: ShellState, query: string, showing: (window: string) => string | null): Item[] {
  const hits = allCommands(shell, showing).filter((a) => matches(query, a))
  if (!hits.length) return [{ kind: 'note', key: 'note', label: '没有匹配的命令，输入 / 查看全部' }]
  return [{ kind: 'section', key: 's:results', label: '结果', count: hits.length }, ...hits]
}
