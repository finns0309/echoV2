import { Menu, Tray, app, nativeImage, type MenuItemConstructorOptions } from 'electron'
import type { Surface } from './surfaces'

export interface TrayWindow {
  id: string
  surface: Surface
  /** Which of the tray's routes this window uses. */
  route: string
  /** The fallback window can't be closed: it is where everything else lands. */
  closable: boolean
}

export interface TrayOptions {
  icon: string
  themes: readonly { id: string; label: string }[]
  /** The ways a window can be told what to take, e.g. everything / lyrics only / agent cards only. */
  routes: readonly { id: string; label: string }[]
  presets: readonly { id: string; label: string }[]
  windows: () => readonly TrayWindow[]
  onPickTheme: (window: string, theme: string) => void
  onPickRoute: (window: string, route: string) => void
  onAddWindow: () => void
  onCloseWindow: (window: string) => void
  onPreset: (preset: string) => void
}

// The menu-bar item. It reads every window's state each time it is rebuilt, and
// the caller rebuilds it whenever any of that changes, so labels never go stale.
export function createTray(opts: TrayOptions) {
  const image = nativeImage.createFromPath(opts.icon)
  image.setTemplateImage(true)
  const tray = new Tray(image)
  const themeLabel = (id: string) => opts.themes.find((t) => t.id === id)?.label ?? id

  function windowItems(w: TrayWindow, many: boolean): MenuItemConstructorOptions[] {
    const s = w.surface.state()
    const fill: MenuItemConstructorOptions =
      s.fill === 'restorable'
        ? { label: '还原窗口大小', click: () => w.surface.toggleFill() }
        : s.fill === 'full'
          ? { label: '铺满屏幕（已铺满）', enabled: false }
          : { label: '铺满屏幕', click: () => w.surface.toggleFill() }
    return [
      {
        label: '主题',
        submenu: opts.themes.map((t) => ({
          label: t.label,
          type: 'radio' as const,
          checked: t.id === s.theme,
          click: () => opts.onPickTheme(w.id, t.id),
        })),
      },
      ...(many
        ? [
            {
              label: '显示什么',
              submenu: opts.routes.map((r) => ({
                label: r.label,
                type: 'radio' as const,
                checked: r.id === w.route,
                click: () => opts.onPickRoute(w.id, r.id),
              })),
            },
          ]
        : []),
      { type: 'separator' },
      { label: '鼠标穿透', type: 'checkbox', checked: s.clickThrough, click: () => w.surface.toggleClickThrough() },
      fill,
      { label: '重置当前主题的窗口', click: () => w.surface.reset() },
      { label: s.visible ? (many ? '隐藏此窗口' : '隐藏 echo') : many ? '显示此窗口' : '显示 echo', click: () => w.surface.toggleVisible() },
      ...(many && w.closable ? [{ label: '关闭此窗口', click: () => opts.onCloseWindow(w.id) }] : []),
    ]
  }

  function rebuild(): void {
    const windows = opts.windows()
    const many = windows.length > 1
    const routeLabel = (id: string) => opts.routes.find((r) => r.id === id)?.label ?? id
    const perWindow: MenuItemConstructorOptions[] = many
      ? windows.map((w, i) => ({
          label: `窗口 ${i + 1} · ${themeLabel(w.surface.state().theme)} · ${routeLabel(w.route)}${w.surface.state().visible ? '' : '（已隐藏）'}`,
          submenu: windowItems(w, true),
        }))
      : windows[0]
        ? windowItems(windows[0], false)
        : []
    tray.setContextMenu(
      Menu.buildFromTemplate([
        ...perWindow,
        { type: 'separator' },
        { label: '新增窗口', click: opts.onAddWindow },
        ...(opts.presets.length ? [{ label: '布局', submenu: opts.presets.map((p) => ({ label: p.label, click: () => opts.onPreset(p.id) })) }] : []),
        { type: 'separator' },
        { label: '退出 echo', click: () => app.quit() },
      ]),
    )
  }

  rebuild()
  return {
    rebuild,
    destroy: () => tray.destroy(),
  }
}
