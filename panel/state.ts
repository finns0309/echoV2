import { computed, effect, signal } from '@preact/signals'
import type { PanelCommand, ShellState, StageState } from '@contract'
import type { PanelBridge } from '@contract/channels'
import { homeItems, searchItems, windowItems, type Item, type Selectable } from './commands'
import { slashItems } from './slash'
import type { Scene } from './vocabulary'

const TOAST_MS = 1600

// What the panel knows and where the user is in it. The shell and stage are as
// the server last sent them; the panel changes nothing itself, it sends commands.
export function createPanelState(bridge: PanelBridge) {
  const shell = signal<ShellState | null>(null)
  const stage = signal<StageState | null>(null)
  const query = signal('')
  /** The window whose settings are open, or null for home. */
  const opened = signal<string | null>(null)
  const cursor = signal(0)
  const toast = signal<string | null>(null)
  /** The row whose command just ran, for a moment: the cursor flashes to acknowledge it. */
  const committed = signal<string | null>(null)
  /** Bumps each time the panel is summoned, to replay the entrance. */
  const summoned = signal(0)

  bridge.on('shell', (s) => {
    shell.value = s
    if (opened.value && !s.windows.some((w) => w.id === opened.value)) opened.value = null
  })
  bridge.on('stage', (s) => (stage.value = s))
  bridge.on('shown', () => {
    query.value = ''
    opened.value = null
    cursor.value = 0
    summoned.value++
  })

  const items = computed<Item[]>(() => {
    if (!shell.value) return []
    const scene: Scene = { shell: shell.value, stage: stage.value }
    if (query.value.startsWith('/')) return slashItems(query.value, scene, opened.value)
    if (query.value.trim()) return searchItems(scene, query.value)
    if (opened.value) return windowItems(scene, opened.value)
    return homeItems(scene)
  })
  const selectable = computed(() => items.value.filter((i): i is Selectable => i.kind !== 'section' && i.kind !== 'note'))
  const current = computed(() => selectable.value[cursor.value])

  // Keep the cursor on something that exists as the list changes under it.
  effect(() => {
    const n = selectable.value.length
    if (cursor.value > n - 1) cursor.value = Math.max(0, n - 1)
  })
  // A new query or view starts at the top.
  effect(() => {
    void query.value
    void opened.value
    cursor.value = 0
  })
  // Point at a window on screen: the one whose settings are open, else the row under the cursor.
  // Again on each summon: the rows may be the same as when it was put away.
  effect(() => {
    void summoned.value
    const item = current.value
    bridge.send('locate', opened.value ?? (item?.kind === 'window' ? item.window : null))
  })

  /** Whether the input is a slash command. */
  const slashing = computed(() => query.value.startsWith('/'))

  let toastTimer: ReturnType<typeof setTimeout> | undefined
  function say(text: string): void {
    toast.value = text
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => (toast.value = null), TOAST_MS)
  }

  let commitTimer: ReturnType<typeof setTimeout> | undefined
  function send(command: PanelCommand | readonly PanelCommand[], note?: string): void {
    for (const c of Array.isArray(command) ? command : [command]) bridge.send('command', c)
    if (note) say(note)
    committed.value = current.value?.key ?? null
    clearTimeout(commitTimer)
    commitTimer = setTimeout(() => (committed.value = null), 180)
  }

  return {
    shell,
    stage,
    query,
    opened,
    cursor,
    toast,
    committed,
    summoned,
    items,
    selectable,
    slashing,
    current,
    /** Ask for the window to be as tall as the content. */
    fit: (height: number) => bridge.send('resize', height),
    move: (by: number) => {
      const n = selectable.value.length
      if (n) cursor.value = (cursor.value + by + n) % n
    },
    /** Enter: open a window, complete a slash command, run an action, or step a setting forwards. */
    activate(item: Selectable | undefined = current.value): void {
      if (!item) return
      if (item.kind === 'window') {
        opened.value = item.window
        query.value = ''
        return
      }
      if (item.fill !== undefined) {
        query.value = item.fill
        return
      }
      const command = item.run ?? item.step?.(1)
      if (!command) return
      send(command, item.run ? `${item.label}${item.on === undefined ? '' : item.on ? ' · 关' : ' · 开'}` : undefined)
      // A search is for one command: once it has run, the list goes back to where it was.
      if (query.value) query.value = ''
    },
    /** ⇥: complete a slash command from the selected row, if it completes to anything. */
    complete(): boolean {
      const item = current.value
      if (item?.kind !== 'action' || item.fill === undefined) return false
      query.value = item.fill
      return true
    },
    /** ←/→ on a setting. */
    step(dir: 1 | -1): boolean {
      const item = current.value
      if (item?.kind !== 'action' || !item.step) return false
      const command = item.step(dir)
      if (command) send(command)
      return true
    },
    /** Esc: clear the query, then leave the window, then put the panel away. */
    back(): void {
      if (query.value) query.value = ''
      else if (opened.value) {
        const was = opened.value
        opened.value = null
        // Land back on the window we came from.
        cursor.value = Math.max(0, selectable.value.findIndex((i) => i.kind === 'window' && i.window === was))
      } else bridge.send('hide', null)
    },
  }
}

export type PanelState = ReturnType<typeof createPanelState>
