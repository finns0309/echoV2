import { Menu, Tray, app, nativeImage } from 'electron'
import type { ShellCommand, ShellState } from '@contract'

export interface TrayOptions {
  icon: string
  /** The shell's state and its one way in; the tray is only a view of them. */
  state: () => ShellState
  subscribe: (listener: () => void) => () => void
  dispatch: (command: ShellCommand) => unknown
  openPanel: () => void
}

// The menu-bar item: the way into the panel, plus the one thing worth a single
// click, showing and hiding windows. Everything else lives in the panel.
// It rebuilds from ShellState whenever that changes, so it never goes stale.
export function createTray({ icon, state, subscribe, dispatch, openPanel }: TrayOptions) {
  const image = nativeImage.createFromPath(icon)
  image.setTemplateImage(true)
  const tray = new Tray(image)

  function rebuild(): void {
    const { windows, themes } = state()
    const themeLabel = (id: string) => themes.find((t) => t.id === id)?.label ?? id
    tray.setContextMenu(
      Menu.buildFromTemplate([
        // Wait for the menu to close: while it tracks it holds the keyboard, and the panel would open unfocused.
        { label: '打开面板（⌥ + 右⌘）', click: () => setTimeout(openPanel, 120) },
        { type: 'separator' },
        ...windows.map((w) => ({
          label: windows.length > 1 ? `${w.name} · ${themeLabel(w.theme)}` : `显示 echo · ${themeLabel(w.theme)}`,
          type: 'checkbox' as const,
          checked: w.visible,
          click: () => dispatch({ type: 'toggleVisible', window: w.id }),
        })),
        { type: 'separator' },
        { label: '退出 echo', click: () => app.quit() },
      ]),
    )
  }

  const off = subscribe(rebuild)
  rebuild()
  return {
    rebuild,
    destroy: () => {
      off()
      tray.destroy()
    },
  }
}
