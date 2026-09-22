import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import type { PanelState } from './state'
import { Mark } from './views/mark'
import { Row } from './views/row'

// The panel: a muse-style command surface. Type to find a command; ↑↓ to move;
// ⏎ to open or run; ←→ to change a setting; esc to go back, then away.
export function App({ state }: { state: PanelState }) {
  const shell = state.shell.value
  const items = state.items.value
  const current = state.current.value
  const opened = state.opened.value
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const selectedRow = useRef<HTMLLIElement>(null)
  const [cursorBox, setCursorBox] = useState<{ y: number; h: number } | null>(null)

  // The input always has focus: typing is how you search.
  useEffect(() => input.current?.focus(), [state.summoned.value, opened])

  // The cursor glides to the selected row.
  useLayoutEffect(() => {
    const row = selectedRow.current
    if (!row) return setCursorBox(null)
    setCursorBox({ y: row.offsetTop, h: row.offsetHeight })
    row.scrollIntoView({ block: 'nearest' })
  }, [current?.key, items])

  function onKey(e: KeyboardEvent): void {
    const key = e.key
    if (key === 'ArrowDown' || (key === 'n' && e.ctrlKey)) state.move(1)
    else if (key === 'ArrowUp' || (key === 'p' && e.ctrlKey)) state.move(-1)
    else if (key === 'Enter') state.activate()
    else if (key === 'Escape') state.back()
    else if ((key === 'ArrowRight' || key === 'ArrowLeft') && !state.query.value) {
      const stepped = state.step(key === 'ArrowRight' ? 1 : -1)
      if (!stepped && key === 'ArrowRight' && current?.kind === 'window') state.activate()
      else if (!stepped && key === 'ArrowLeft' && opened) state.back()
    } else if (key === 'Backspace' && !state.query.value && opened) state.back()
    else return
    e.preventDefault()
  }

  const where = opened ? shell?.windows.find((w) => w.id === opened)?.name : null
  const live = shell?.windows.filter((w) => w.visible).length ?? 0

  return (
    <div class="panel" key={state.summoned.value}>
      <header class="strip">
        <Mark />
        <div class="strip-meta">
          <div class="strip-title">echo</div>
          <div class="strip-sub">{shell ? `${shell.windows.length} 个窗口 · ${live} 个在显示` : '连接中…'}</div>
        </div>
        <div class={state.toast.value ? 'toast show' : 'toast'} aria-live="polite">
          {state.toast.value}
        </div>
      </header>

      <div class="input-row">
        <span class="chevron" aria-hidden="true">
          ❯
        </span>
        {where && <span class="crumb">{where}</span>}
        <input
          ref={input}
          class="input"
          placeholder={where ? '调整这个窗口，或输入命令…' : '输入命令：top 流体、隐藏 left、双风铃…'}
          value={state.query.value}
          onInput={(e) => (state.query.value = e.currentTarget.value)}
          onKeyDown={onKey}
          onBlur={(e) => e.currentTarget.focus()}
          spellcheck={false}
        />
      </div>

      <div class="list-wrap">
        <ul class="list" ref={list} role="listbox">
          {cursorBox && (
            <li class="cursor" aria-hidden="true" style={{ transform: `translateY(${cursorBox.y}px)`, height: `${cursorBox.h}px` }} />
          )}
          {items.map((item) => {
            const selected = item.kind !== 'section' && item.key === current?.key
            return (
              <Row
                key={item.key}
                item={item}
                selected={selected}
                rowRef={selected ? selectedRow : undefined}
                onPick={() => item.kind !== 'section' && state.activate(item)}
                onHover={() => {
                  const i = state.selectable.value.findIndex((s) => s.key === item.key)
                  if (i >= 0 && i !== state.cursor.value) state.cursor.value = i
                }}
              />
            )
          })}
          {state.query.value && items.length <= 1 && <li class="empty">没有匹配的命令</li>}
        </ul>
      </div>

      <footer class="keys">
        <span>
          <kbd>↑↓</kbd> 选择
        </span>
        <span>
          <kbd>⏎</kbd> {opened ? '切换' : '打开'}
        </span>
        {opened && (
          <span>
            <kbd>←→</kbd> 调整
          </span>
        )}
        <span>
          <kbd>esc</kbd> {state.query.value ? '清空' : opened ? '返回' : '收起'}
        </span>
        <span class="keys-right">⌥ + 右⌘ 呼出</span>
      </footer>
    </div>
  )
}
