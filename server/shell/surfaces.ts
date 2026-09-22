import { BrowserWindow, screen } from 'electron'
import { resolveProfile } from './profiles'

export interface SurfaceOptions {
  profile: string
  preload: string
}

// A surface is one transparent, frameless, always-on-top window hosting a screen.
export function openSurface({ profile, preload }: SurfaceOptions): BrowserWindow {
  const bounds = resolveProfile(profile, screen.getPrimaryDisplay().workArea)
  const win = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    webPreferences: { preload, contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  // 'floating' rather than 'screen-saver' so menu-bar popovers still draw above us.
  win.setAlwaysOnTop(true, 'floating')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.setIgnoreMouseEvents(bounds.clickThrough, { forward: true })
  win.once('ready-to-show', () => win.showInactive())
  return win
}
