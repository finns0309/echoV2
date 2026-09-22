import { Menu, Tray, app, nativeImage, type MenuItemConstructorOptions } from 'electron'
import type { Surface } from './surfaces'

export interface TrayOptions {
  icon: string
  themes: readonly { id: string; label: string }[]
  /** The surface the menu acts on. */
  surface: Surface
  onPickTheme: (id: string) => void
}

// The menu-bar item. It reads the surface's state every time it is rebuilt,
// and rebuilds whenever that state changes, so labels never go stale.
export function createTray({ icon, themes, surface, onPickTheme }: TrayOptions) {
  const image = nativeImage.createFromPath(icon)
  image.setTemplateImage(true)
  const tray = new Tray(image)

  function rebuild(): void {
    const s = surface.state()
    const fill: MenuItemConstructorOptions =
      s.fill === 'restorable'
        ? { label: '还原窗口大小', click: () => surface.toggleFill() }
        : s.fill === 'full'
          ? { label: '铺满屏幕（已铺满）', enabled: false }
          : { label: '铺满屏幕', click: () => surface.toggleFill() }
    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: '主题',
          submenu: themes.map((t) => ({ label: t.label, type: 'radio' as const, checked: t.id === s.theme, click: () => onPickTheme(t.id) })),
        },
        { type: 'separator' },
        { label: '鼠标穿透', type: 'checkbox', checked: s.clickThrough, click: () => surface.toggleClickThrough() },
        fill,
        { label: '重置当前主题的窗口', click: () => surface.reset() },
        { label: s.visible ? '隐藏 echo' : '显示 echo', click: () => surface.toggleVisible() },
        { type: 'separator' },
        { label: '退出 echo', click: () => app.quit() },
      ]),
    )
  }

  const off = surface.onChange(rebuild)
  rebuild()
  return {
    rebuild,
    destroy: () => {
      off()
      tray.destroy()
    },
  }
}
