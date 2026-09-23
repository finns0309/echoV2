import { Menu } from 'electron'
import type { ShellCommand, ShellState } from '@contract'

export interface AppMenuOptions {
  state: () => ShellState
  dispatch: (command: ShellCommand) => unknown
  /** The echo window with the keyboard, if any. */
  focused: () => string | null
}

/**
 * The application menu. Echo is a menu-bar app, so it never shows; it is here for its
 * keys: editing in the panel's input (⌘C, ⌘V, ...), and ⌃⌘F, macOS's full-screen key,
 * which goes through the shell like every other way of changing a window (Electron's
 * default menu would take the window full screen behind the shell's back).
 */
export function installAppMenu({ state, dispatch, focused }: AppMenuOptions): void {
  const toggleFullScreen = () => {
    const id = focused()
    const w = id ? state().windows.find((x) => x.id === id) : undefined
    if (w) dispatch({ type: 'setFullScreen', window: w.id, on: !w.fullScreen })
  }
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: 'appMenu' },
      { role: 'editMenu' },
      { label: '窗口', submenu: [{ label: '全屏', accelerator: 'Ctrl+Cmd+F', click: toggleFullScreen }] },
    ]),
  )
}
