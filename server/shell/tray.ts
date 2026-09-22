import { Menu, Tray, app, nativeImage, type MenuItemConstructorOptions } from 'electron'
import type { ShellCommand, ShellState, ShellWindow } from '@contract'

export interface TrayOptions {
  icon: string
  /** The shell's state and its one way in; the tray is only a view of them. */
  state: () => ShellState
  subscribe: (listener: () => void) => () => void
  dispatch: (command: ShellCommand) => unknown
  openPanel: () => void
}

// The menu-bar item. It rebuilds from ShellState whenever that changes, so labels never go stale.
export function createTray({ icon, state, subscribe, dispatch, openPanel }: TrayOptions) {
  const image = nativeImage.createFromPath(icon)
  image.setTemplateImage(true)
  const tray = new Tray(image)

  function windowItems(s: ShellState, w: ShellWindow, many: boolean): MenuItemConstructorOptions[] {
    const window = w.id
    const taken = new Set(s.windows.map((x) => x.name))
    const names = s.names.includes(w.name) ? s.names : [w.name, ...s.names]
    const fill: MenuItemConstructorOptions =
      w.fill === 'restorable'
        ? { label: '还原窗口大小', click: () => dispatch({ type: 'toggleFill', window }) }
        : w.fill === 'full'
          ? { label: '铺满屏幕（已铺满）', enabled: false }
          : { label: '铺满屏幕', click: () => dispatch({ type: 'toggleFill', window }) }
    return [
      {
        label: '主题',
        submenu: s.themes.map((t) => ({
          label: t.label,
          type: 'radio' as const,
          checked: t.id === w.theme,
          click: () => dispatch({ type: 'setTheme', window, theme: t.id }),
        })),
      },
      ...(many && !w.main
        ? [
            {
              label: `名字：${w.name}`,
              submenu: names.map((n) => ({
                label: n,
                type: 'radio' as const,
                checked: n === w.name,
                enabled: n === w.name || !taken.has(n),
                click: () => dispatch({ type: 'rename', window, name: n }),
              })),
            },
          ]
        : []),
      ...(many
        ? [
            {
              label: '显示什么',
              submenu: s.routes.map((r) => ({
                label: r.label,
                type: 'radio' as const,
                checked: r.id === w.route,
                click: () => dispatch({ type: 'setRoute', window, route: r.id }),
              })),
            },
          ]
        : []),
      { type: 'separator' },
      { label: '鼠标穿透', type: 'checkbox', checked: w.clickThrough, click: () => dispatch({ type: 'toggleClickThrough', window }) },
      fill,
      { label: '重置当前主题的窗口', click: () => dispatch({ type: 'resetWindow', window }) },
      {
        label: w.visible ? (many ? '隐藏此窗口' : '隐藏 echo') : many ? '显示此窗口' : '显示 echo',
        click: () => dispatch({ type: 'toggleVisible', window }),
      },
      ...(many && !w.main ? [{ label: '关闭此窗口', click: () => dispatch({ type: 'closeWindow', window }) }] : []),
    ]
  }

  function rebuild(): void {
    const s = state()
    const many = s.windows.length > 1
    const themeLabel = (id: string) => s.themes.find((t) => t.id === id)?.label ?? id
    const routeLabel = (id: string) => s.routes.find((r) => r.id === id)?.label ?? id
    const perWindow: MenuItemConstructorOptions[] = many
      ? s.windows.map((w) => ({
          label: `${w.name} · ${themeLabel(w.theme)} · ${routeLabel(w.route)}${w.visible ? '' : '（已隐藏）'}`,
          submenu: windowItems(s, w, true),
        }))
      : s.windows[0]
        ? windowItems(s, s.windows[0], false)
        : []
    tray.setContextMenu(
      Menu.buildFromTemplate([
        // Wait for the menu to close: while it tracks it holds the keyboard, and the panel would open unfocused.
        { label: '打开面板（⌥ + 右 ⌘）', click: () => setTimeout(openPanel, 120) },
        { type: 'separator' },
        ...perWindow,
        { type: 'separator' },
        { label: '新增窗口', click: () => dispatch({ type: 'addWindow' }) },
        ...(s.presets.length
          ? [{ label: '布局', submenu: s.presets.map((p) => ({ label: p.label, click: () => dispatch({ type: 'applyPreset', preset: p.id }) })) }]
          : []),
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
