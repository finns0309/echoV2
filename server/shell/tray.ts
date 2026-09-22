import { Menu, Tray, app, nativeImage } from 'electron'

export interface TrayOptions {
  icon: string
  themes: readonly { id: string; label: string }[]
  current: () => string
  onPickTheme: (id: string) => void
}

// The menu-bar item: pick a theme, quit. Rebuilt whenever the choice changes.
export function createTray({ icon, themes, current, onPickTheme }: TrayOptions) {
  const image = nativeImage.createFromPath(icon)
  image.setTemplateImage(true)
  const tray = new Tray(image)

  function rebuild(): void {
    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: '主题',
          submenu: themes.map((t) => ({
            label: t.label,
            type: 'radio' as const,
            checked: t.id === current(),
            click: () => onPickTheme(t.id),
          })),
        },
        { type: 'separator' },
        { label: '退出 echo', click: () => app.quit() },
      ]),
    )
  }

  rebuild()
  return { rebuild, destroy: () => tray.destroy() }
}
