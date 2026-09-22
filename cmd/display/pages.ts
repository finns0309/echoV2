// Where the display server's pages and helpers live, in development and packaged.
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, type BrowserWindow } from 'electron'

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url))

/** The one preload every echo window uses. */
export const PRELOAD = here('../preload/preload.cjs')

/** The ⌥ + right ⌘ helper: in the app's Resources when packaged, in out/native in development. */
export const HOTKEY_HELPER = app.isPackaged ? join(process.resourcesPath, 'echo-hotkey') : here('../native/echo-hotkey')

// In development the renderer is served by Vite with hot reload; packaged, from out/renderer.
const devUrl = () => process.env.ELECTRON_RENDERER_URL

export function loadScreen(win: BrowserWindow, surface: string): Promise<void> {
  const dev = devUrl()
  return dev
    ? win.loadURL(`${dev}/screen/index.html?surface=${encodeURIComponent(surface)}`)
    : win.loadFile(here('../renderer/screen/index.html'), { query: { surface } })
}

export function loadPanel(win: BrowserWindow): Promise<void> {
  const dev = devUrl()
  return dev ? win.loadURL(`${dev}/panel/index.html`) : win.loadFile(here('../renderer/panel/index.html'))
}
