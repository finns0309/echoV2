import { BrowserWindow, ipcMain } from 'electron'
import { channelName, type ScreenToServer, type ServerToScreen } from '@contract/channels'

// Transport between the display server and its screens over Electron IPC.
// It moves payloads; it never interprets them.
export function createScreenChannel() {
  const windows = new Set<BrowserWindow>()

  return {
    attach(win: BrowserWindow): void {
      windows.add(win)
      win.on('closed', () => windows.delete(win))
    },

    publish<K extends keyof ServerToScreen>(channel: K, payload: ServerToScreen[K]): void {
      for (const win of windows) {
        if (!win.isDestroyed()) win.webContents.send(channelName(channel), payload)
      }
    },

    onReady(listener: (payload: ScreenToServer['ready'], win: BrowserWindow) => void): void {
      ipcMain.on(channelName('ready'), (event, payload: ScreenToServer['ready']) => {
        const win = BrowserWindow.fromWebContents(event.sender)
        if (win && windows.has(win)) listener(payload, win)
      })
    },
  }
}

export type ScreenChannel = ReturnType<typeof createScreenChannel>
