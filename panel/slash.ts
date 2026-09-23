// Slash commands, muse-style: /verb, then a window, then a value, each step
// completed from a list. Another view of the vocabulary, pure and testable.
//
//   /new [主题]                 新增窗口
//   /open <窗口>                打开窗口设置
//   /theme <窗口> <主题>        /route <窗口> <内容>        /name <窗口> <名字>
//   /loud <窗口> <醒目|正常|安静>
//   /skip <窗口>                /clear <窗口>
//   /show <窗口>  /hide <窗口>  /click <窗口> [开|关]       /full <窗口> [开|关]
//   /reset <窗口>               /close <窗口>
//   /pause  /resume
//
// Inside a window's settings the window is implied: /theme 流体. Where it makes
// sense, 全部 (or all) stands for every window: /hide 全部, /loud 全部 安静.
import type { PanelCommand, ShellWindow } from '@contract'
import type { Action, Item } from './commands'
import { NEW_WINDOW, PAUSE, WINDOW_VERBS, describe, switchLine, type Scene, type SwitchVerb, type WindowVerb } from './vocabulary'

type Word =
  | { kind: 'new'; word: string; label: string; words: string; usage: string }
  | { kind: 'open'; word: string; label: string; words: string; usage: string }
  /** A switch for the whole stage, set outright: /pause, /resume. */
  | { kind: 'stage'; word: string; label: string; words: string; usage: string; set: boolean }
  /** `set`: a switch spelled as two words (/show, /hide) sets it outright. */
  | { kind: 'verb'; word: string; label: string; words: string; usage: string; verb: WindowVerb; set?: boolean }
type VerbWord = Extract<Word, { kind: 'verb' }>

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
  { kind: 'stage', word: PAUSE.spell.on.slash, label: PAUSE.spell.on.label, words: PAUSE.words, usage: '', set: true },
  { kind: 'stage', word: PAUSE.spell.off.slash, label: PAUSE.spell.off.label, words: PAUSE.words, usage: '', set: false },
]

const ALL = '全部'
const lower = (s: string) => s.toLowerCase()
const isAll = (s: string) => s === ALL || lower(s) === 'all'
const hits = (partial: string, ...fields: string[]) => !partial || fields.some((f) => lower(f).includes(lower(partial)))
const section = (key: string, label: string): Item => ({ kind: 'section', key: `s:${key}`, label })
const note = (label: string): Item => ({ kind: 'note', key: 'note', label })

/**
 * The list for what has been typed so far. `input` starts with '/'; the last
 * token is the one being typed (empty right after a space).
 */
export function slashItems(input: string, scene: Scene, opened: string | null): Item[] {
  const { shell } = scene
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
  if (word.kind === 'new') return newWindowItems(scene, args, partial)
  if (word.kind === 'stage') return stageItems(scene, word, args, partial)

  if (word.kind === 'verb' && args[0] !== undefined && isAll(args[0])) return allItems(scene, word, args.slice(1), partial)
  // The window: named in the first argument, or implied by the settings page we're on.
  const named = args[0] === undefined ? undefined : shell.windows.find((w) => lower(w.name) === lower(args[0]!))
  const w = named ?? (opened ? shell.windows.find((x) => x.id === opened) : undefined)
  const rest = named ? args.slice(1) : args
  if (!w) {
    if (args.length) return [note(`没有叫 ${args[0]} 的窗口`)]
    return windowChoices(scene, word, partial)
  }
  if (rest.length) return [note(`/${word.word} 用法：/${word.word} ${word.usage}`)]
  const items = valueItems(scene, word, w, partial)
  // On a settings page the window is implied, but a window name typed here should still be found.
  if (!named && opened && !items.some((i) => i.kind === 'action') && partial) {
    const other = windowChoices(scene, word, partial)
    if (other.some((i) => i.kind !== 'note' && i.kind !== 'section')) return other
  }
  return items
}

function newWindowItems({ shell }: Scene, args: string[], partial: string): Item[] {
  if (args.length) return [note('用法：/new [主题]')]
  const themes = shell.themes.filter((t) => hits(partial, t.id, t.label))
  return [
    section('new', NEW_WINDOW.label),
    ...(partial ? [] : [{ kind: 'action' as const, key: 'new', label: NEW_WINDOW.label, glyph: '+', run: NEW_WINDOW.run() }]),
    ...themes.map((t): Item => ({ kind: 'action', key: `new:${t.id}`, label: `${NEW_WINDOW.label} · ${t.label}`, glyph: '+', run: NEW_WINDOW.run(t.id) })),
  ]
}

function stageItems(scene: Scene, word: Extract<Word, { kind: 'stage' }>, args: string[], partial: string): Item[] {
  if (args.length || partial) return [note(`用法：/${word.word}`)]
  if (PAUSE.value(scene) === word.set) return [note(word.set ? '已经暂停了，/resume 继续' : '没有暂停')]
  return [section('run', '执行'), { kind: 'action', key: `/${word.word}`, label: word.label, run: PAUSE.set(word.set) }]
}

/** Step two: which window. Picking one runs the command when nothing more is needed. */
function windowChoices(scene: Scene, word: Word, partial: string): Item[] {
  const { shell } = scene
  const candidates = shell.windows.filter((w) => hits(partial, w.name) && fitsWindow(scene, word, w))
  const every = word.kind === 'verb' && hits(partial, ALL, 'all') ? allRow(scene, word) : null
  if (!candidates.length && !every) return [note(partial ? `没有叫 ${partial} 的窗口可以${word.label}` : `没有窗口可以${word.label}`)]
  return [
    section('windows', '窗口'),
    ...candidates.map((w): Item => {
      if (word.kind !== 'verb') return { kind: 'window', key: `open:${w.id}`, window: w.id, label: w.name, sub: describe(shell, w), hint: '打开设置', on: w.visible }
      const done = runFor(word, w)
      return done ?? { kind: 'action', key: `${word.word}:${w.id}`, label: w.name, sub: describe(shell, w), fill: `/${word.word} ${w.name} ` }
    }),
    ...(every ? [every] : []),
  ]
}

/** Can this word do anything to this window? (/hide lists only windows that are showing.) */
function fitsWindow(scene: Scene, word: Word, w: ShellWindow): boolean {
  if (word.kind !== 'verb') return true
  const { verb } = word
  if (!verb.applies(scene, w)) return false
  return verb.kind !== 'switch' || word.set === undefined || verb.value(w) !== word.set
}

/** The finished command for a word that needs nothing after the window, else null. */
function runFor(word: VerbWord, w: ShellWindow): Action | null {
  const { verb } = word
  const key = `${word.word}:${w.id}`
  if (verb.kind === 'action') return { kind: 'action', key, label: `${w.name} · ${verb.label}`, run: verb.run(w), ...(verb.danger ? { danger: true } : {}) }
  if (verb.kind === 'switch' && word.set !== undefined) return { kind: 'action', key, label: switchLine(verb, w, word.set), run: verb.set(w, word.set) }
  return null
}

/** Step three: the value, for a window we know. */
function valueItems(scene: Scene, word: Word, w: ShellWindow, partial: string): Item[] {
  if (word.kind === 'open') return windowChoices(scene, word, w.name)
  if (word.kind !== 'verb') return []
  const { verb } = word
  if (!fitsWindow(scene, word, w)) return [note(`${w.name} 不能${word.label}`)]
  const done = runFor(word, w)
  if (done) return [section('run', '执行'), done]
  if (verb.kind === 'switch') return switchItems(verb, w, partial)
  if (verb.kind !== 'choice') return []
  const current = verb.current(w)
  const choices = verb.choices(scene, w).filter((c) => hits(partial, c.id, c.label))
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
  const options = [!on, on]
    .map((to) => ({ to, word: to ? '开' : '关', alias: to ? 'on' : 'off' }))
    .filter((o) => hits(partial, o.word, o.alias))
  return [
    section('values', `${w.name} · ${verb.label}（现在${on ? '开' : '关'}）`),
    ...options.map((o): Item => ({ kind: 'action', key: `${verb.slash}:${w.id}:${o.alias}`, label: switchLine(verb, w, o.to), ...(o.to === on ? { value: '当前' } : { run: verb.set(w, o.to) }) })),
  ]
}

// 全部: every window the word can do something to.

const targets = (scene: Scene, word: VerbWord) => scene.shell.windows.filter((w) => fitsWindow(scene, word, w))

/** The 全部 row under the windows: runs at once when nothing more is needed, else completes. Null when it makes no sense. */
function allRow(scene: Scene, word: VerbWord): Action | null {
  const { verb } = word
  const windows = targets(scene, word)
  if (verb.all === false || !windows.length) return null
  // "All" of one window is just that window, unless all means more (clearing what waits too).
  if (windows.length < 2 && !(verb.kind === 'action' && verb.everything)) return null
  return runForAll(word, windows) ?? { kind: 'action', key: `${word.word}:all`, label: ALL, sub: `${windows.length} 个窗口`, fill: `/${word.word} ${ALL} ` }
}

function runForAll(word: VerbWord, windows: ShellWindow[]): Action | null {
  const { verb } = word
  const key = `${word.word}:all`
  const sub = `${windows.length} 个窗口`
  if (verb.kind === 'action') {
    if (verb.everything) return { kind: 'action', key, label: verb.everything.label, run: verb.everything.run }
    return { kind: 'action', key, label: `${ALL} · ${verb.label}`, sub, run: windows.map((w) => verb.run(w)), ...(verb.danger ? { danger: true } : {}) }
  }
  const set = word.set
  if (verb.kind === 'switch' && set !== undefined) return { kind: 'action', key, label: `${ALL} · ${word.label}`, sub, run: windows.map((w) => verb.set(w, set)) }
  return null
}

/** Step three for 全部: the value, set on every window that doesn't have it yet. */
function allItems(scene: Scene, word: VerbWord, rest: string[], partial: string): Item[] {
  const { verb } = word
  if (verb.all === false) return [note(`/${word.word} 一次只能对一个窗口`)]
  if (rest.length) return [note(`/${word.word} 用法：/${word.word} ${word.usage.replace('<窗口>', ALL)}`)]
  const windows = targets(scene, word)
  if (!windows.length) return [note(`没有窗口可以${word.label}`)]
  const done = runForAll(word, windows)
  if (done) return [section('run', '执行'), done]

  const option = (key: string, label: string, needs: ShellWindow[], make: (w: ShellWindow) => PanelCommand): Item => ({
    kind: 'action',
    key: `${word.word}:all:${key}`,
    label,
    ...(needs.length ? { sub: `${needs.length} 个窗口`, run: needs.map(make) } : { value: '都是' }),
  })
  if (verb.kind === 'switch') {
    const options = [true, false].filter((to) => hits(partial, to ? '开' : '关', to ? 'on' : 'off'))
    return [
      section('values', `${ALL} · ${verb.label}`),
      ...options.map((to) => option(to ? 'on' : 'off', `${ALL} · ${to ? '打开' : '关闭'}${verb.label}`, windows.filter((w) => verb.value(w) !== to), (w) => verb.set(w, to))),
    ]
  }
  if (verb.kind !== 'choice') return []
  const choices = verb.choices(scene, windows[0]!).filter((c) => hits(partial, c.id, c.label))
  if (!choices.length) return [note(`没有叫 ${partial} 的${verb.arg}`)]
  return [
    section('values', `${ALL} · ${verb.label}`),
    ...choices.map((c) => option(c.id, c.label, windows.filter((w) => verb.current(w) !== c.id), (w) => verb.set(w, c.id))),
  ]
}
