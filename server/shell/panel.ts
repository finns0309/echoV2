import { BrowserWindow, nativeTheme, screen } from 'electron'

export interface PanelWindowOptions {
  preload: string
  load: (win: BrowserWindow) => Promise<void>
  /** Called each time it is summoned, so the view can reset its focus. */
  onShow?: () => void
}

const WIDTH = 640
const HEIGHT = 460
// Must match --bg in panel/panel.css, or the window shows a flash of the wrong color as it appears.
const background = () => (nativeTheme.shouldUseDarkColors ? '#1c1c1e' : '#f5f5f7')

/**
 * The panel: a Spotlight-like window summoned by the hotkey, on the display under
 * the pointer. It hides when it loses focus, and is created once and reused.
 */
export function createPanelWindow({ preload, load, onShow }: PanelWindowOptions) {
  const win = new BrowserWindow({
    // A non-activating NSPanel, like Spotlight: it takes the keyboard without
    // pulling echo (a menu-bar app) to the front, which macOS won't reliably allow.
    type: 'panel',
    width: WIDTH,
    height: HEIGHT,
    show: false,
    // Titled but with the title bar hidden: a borderless window can't become key
    // without activating its app, and taking the keyboard without that is the point.
    titleBarStyle: 'hidden',
    resizable: false,
    movable: true,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: background(),
    roundedCorners: true,
    // The shared preload exposes the panel bridge, not the screen one, when it sees --echo-panel.
    webPreferences: { preload, contextIsolation: true, nodeIntegration: false, sandbox: true, additionalArguments: ['--echo-panel'] },
  })
  win.setWindowButtonVisibility(false)
  win.setAlwaysOnTop(true, 'modal-panel')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.on('blur', () => win.hide())
  nativeTheme.on('updated', () => win.setBackgroundColor(background()))
  // The panel has no devtools open; surface its warnings and errors in echo's log.
  win.webContents.on('console-message', (event) => {
    if (event.level === 'warning' || event.level === 'error') console.log(`[panel] ${event.level}: ${event.message}`)
  })
  void load(win)

  function show(): void {
    const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    win.setBounds({
      x: Math.round(workArea.x + (workArea.width - WIDTH) / 2),
      y: Math.round(workArea.y + workArea.height * 0.16),
      width: WIDTH,
      height: HEIGHT,
    })
    win.show()
    win.focus()
    onShow?.()
  }

  return {
    win,
    show,
    hide: () => win.hide(),
    // Not isFocused(): a panel that never activates echo can hold the keyboard without reporting focus.
    toggle: () => (win.isVisible() ? win.hide() : show()),
  }
}

export type PanelWindow = ReturnType<typeof createPanelWindow>
