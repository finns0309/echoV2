// Slash commands, muse-style: /verb, then a window, then a value, each step
// completed from a list. Another view of the vocabulary, pure and testable.
//
//   /new [主题]                 新增窗口
//   /open <窗口>                打开窗口设置
//   /theme <窗口> <主题>        /route <窗口> <内容>        /name <窗口> <名字>
//   /loud <窗口> <醒目|正常|安静>
//   /show <窗口>  /hide <窗口>  /click <窗口> [开|关]       /fill <窗口> [开|关]
//   /reset <窗口>               /close <窗口>
//
// Inside a window's settings the window is implied: /theme 流体.
import type { ShellState, ShellWindow } from '@contract'
import type { Action, Item } from './commands'
import { NEW_WINDOW, WINDOW_VERBS, describe, switchLine, type SwitchVerb, type WindowVerb } from './vocabulary'

type Word =
  | { kind: 'new'; word: string; label: string; words: string; usage: string }
  | { kind: 'open'; word: string; label: string; words: string; usage: string }
  /** `set`: a switch spelled as two words (/show, /hide) sets it outright. */
  | { kind: 'verb'; word: string; label: string; words: string; usage: string; verb: WindowVerb; set?: boolean }

function usage(v: WindowVerb): string {
  if (v.kind === 'choice') return `<窗口> <${v.arg}>`
  if (v.kind === 'switch') return '<窗口> [开|关]'
  return '<窗口>'
}

/** Every slash word, in the order /-help lists them. */
export const WORDS: readonly Word[] = [
  { kind: 'new', word: NEW_WINDOW.slash, label: NEW_WINDOW.label, words: NEW_WINDOW.words, usage: '[主题]' },
  { kind: 'open', word: 'open', label: '打开窗口设置', words: 'dakai 设置 settings', usage: '<窗口>' },
  ...WINDOW_VERBS.flatMap((verb): Word[] => {
    if (verb.kind === 'switch' && verb.spell) {
      const { on, off } = verb.spell
      return [
        { kind: 'verb', word: on.slash, label: on.label, words: verb.words, usage: '<窗口>', verb, set: true },
        { kind: 'verb', word: off.slash, label: off.label, words: verb.words, usage: '<窗口>', verb, set: false },
      ]
    }
    return [{ kind: 'verb', word: verb.slash, label: verb.label, words: verb.words, usage: usage(verb), verb }]
  }),
]

const lower = (s: string) => s.toLowerCase()
const hits = (partial: string, ...fields: string[]) => !partial || fields.some((f) => lower(f).includes(lower(partial)))
const section = (key: string, label: string): Item => ({ kind: 'section', key: `s:${key}`, label })
const note = (label: string): Item => ({ kind: 'note', key: 'note', label })

/**
 * The list for what has been typed so far. `input` starts with '/'; the last
 * token is the one being typed (empty right after a space).
 */
export function slashItems(input: string, shell: ShellState, opened: string | null): Item[] {
  const tokens = input.slice(1).split(/\s+/)
  const partial = tokens.pop() ?? ''
  const [head, ...args] = tokens

  if (head === undefined) {
    // Latin letters spell the command itself (/th → /theme); anything else finds it by its Chinese name.
    const latin = /^[\x20-\x7e]*$/.test(partial)
    const found = WORDS.filter((w) => (latin ? w.word.startsWith(lower(partial)) : hits(partial, w.label, w.words)))
    return found.length
      ? [section('words', '命令'), ...found.map((w): Item => ({ kind: 'action', key: `/${w.word}`, label: `/${w.word}`, sub: w.label, value: w.usage, fill: `/${w.word} ` }))]
      : [note(`没有以 /${partial} 开头的命令`)]
  }

  const word = WORDS.find((w) => w.word === lower(head))
  if (!word) return [note(`没有 /${head} 这个命令，输入 / 查看全部`)]
  if (word.kind === 'new') return newWindowItems(shell, args, partial)

  // The window: named in the first argument, or implied by the settings page we're on.
  const named = args[0] === undefined ? undefined : shell.windows.find((w) => lower(w.name) === lower(args[0]!))
  const w = named ?? (opened ? shell.windows.find((x) => x.id === opened) : undefined)
  const rest = named ? args.slice(1) : args
  if (!w) {
    if (args.length) return [note(`没有叫 ${args[0]} 的窗口`)]
    return windowChoices(shell, word, partial)
  }
  if (rest.length) return [note(`/${word.word} 用法：/${word.word} ${word.usage}`)]
  const items = valueItems(shell, word, w, partial)
  // On a settings page the window is implied, but a window name typed here should still be found.
  if (!named && opened && !items.some((i) => i.kind === 'action') && partial) {
    const other = windowChoices(shell, word, partial)
    if (other.some((i) => i.kind !== 'note' && i.kind !== 'section')) return other
  }
  return items
}

function newWindowItems(shell: ShellState, args: string[], partial: string): Item[] {
  if (args.length) return [note('用法：/new [主题]')]
  const themes = shell.themes.filter((t) => hits(partial, t.id, t.label))
  return [
    section('new', NEW_WINDOW.label),
    ...(partial ? [] : [{ kind: 'action' as const, key: 'new', label: NEW_WINDOW.label, glyph: '+', run: NEW_WINDOW.run() }]),
    ...themes.map((t): Item => ({ kind: 'action', key: `new:${t.id}`, label: `${NEW_WINDOW.label} · ${t.label}`, glyph: '+', run: NEW_WINDOW.run(t.id) })),
  ]
}

/** Step two: which window. Picking one runs the command when nothing more is needed. */
function windowChoices(shell: ShellState, word: Word, partial: string): Item[] {
  const candidates = shell.windows.filter((w) => hits(partial, w.name) && fitsWindow(shell, word, w))
  if (!candidates.length) return [note(partial ? `没有叫 ${partial} 的窗口可以${word.label}` : `没有窗口可以${word.label}`)]
  return [
    section('windows', '窗口'),
    ...candidates.map((w): Item => {
      if (word.kind !== 'verb') return { kind: 'window', key: `open:${w.id}`, window: w.id, label: w.name, sub: describe(shell, w), hint: '打开设置', on: w.visible }
      const done = runFor(word, w)
      return done ?? { kind: 'action', key: `${word.word}:${w.id}`, label: w.name, sub: describe(shell, w), fill: `/${word.word} ${w.name} ` }
    }),
  ]
}

/** Can this word do anything to this window? (/hide lists only windows that are showing.) */
function fitsWindow(shell: ShellState, word: Word, w: ShellWindow): boolean {
  if (word.kind !== 'verb') return true
  const { verb } = word
  if (!verb.applies(shell, w)) return false
  if (verb.kind === 'switch') {
    const on = verb.value(w)
    return on !== null && (word.set === undefined || on !== word.set)
  }
  return true
}

/** The finished command for a word that needs nothing after the window, else null. */
function runFor(word: Extract<Word, { kind: 'verb' }>, w: ShellWindow): Action | null {
  const { verb } = word
  const key = `${word.word}:${w.id}`
  if (verb.kind === 'action') return { kind: 'action', key, label: `${w.name} · ${verb.label}`, run: verb.run(w), ...(verb.danger ? { danger: true } : {}) }
  if (verb.kind === 'switch' && word.set !== undefined) return { kind: 'action', key, label: switchLine(verb, w, word.set), run: verb.set(w, word.set) }
  return null
}

/** Step three: the value, for a window we know. */
function valueItems(shell: ShellState, word: Word, w: ShellWindow, partial: string): Item[] {
  if (word.kind === 'open') return windowChoices(shell, word, w.name)
  if (word.kind !== 'verb') return []
  const { verb } = word
  if (!fitsWindow(shell, word, w)) return [note(`${w.name} 不能${word.label}`)]
  const done = runFor(word, w)
  if (done) return [section('run', '执行'), done]
  if (verb.kind === 'switch') return switchItems(verb, w, partial)
  if (verb.kind !== 'choice') return []
  const current = verb.current(w)
  const choices = verb.choices(shell, w).filter((c) => hits(partial, c.id, c.label))
  if (!choices.length) return [note(`没有叫 ${partial} 的${verb.arg}`)]
  return [
    section('values', `${w.name} · ${verb.label}`),
    ...choices.map((c): Item => ({
      kind: 'action',
      key: `${word.word}:${w.id}:${c.id}`,
      label: c.label,
      ...(c.id === current ? { value: '当前' } : { run: verb.set(w, c.id) }),
    })),
  ]
}

/** /click left [开|关]: the flip first, then the other state. */
function switchItems(verb: SwitchVerb, w: ShellWindow, partial: string): Item[] {
  const on = verb.value(w)
  if (on === null) return [note(`${w.name}：${verb.fixed ?? `不能${verb.label}`}`)]
  const options = [!on, on]
    .map((to) => ({ to, word: to ? '开' : '关', alias: to ? 'on' : 'off' }))
    .filter((o) => hits(partial, o.word, o.alias))
  return [
    section('values', `${w.name} · ${verb.label}（现在${on ? '开' : '关'}）`),
    ...options.map((o): Item => ({ kind: 'action', key: `${verb.slash}:${w.id}:${o.alias}`, label: switchLine(verb, w, o.to), ...(o.to === on ? { value: '当前' } : { run: verb.set(w, o.to) }) })),
  ]
}
