import { ipcMain, type BrowserWindow } from 'electron'
import { ShellCommand } from '@contract'
import { panelChannelName, type ServerToPanel } from '@contract/channels'

// Transport between the display server and the panel over Electron IPC. It moves
// payloads and checks what comes in; what a command does is the shell's business.
export function createPanelChannel(handlers: {
  command: (command: ShellCommand) => void
  hide: () => void
  ready: () => void
}) {
  let win: BrowserWindow | null = null
  const fromPanel = (sender: Electron.WebContents) => !!win && !win.isDestroyed() && sender === win.webContents

  ipcMain.on(panelChannelName('command'), (event, payload: unknown) => {
    if (!fromPanel(event.sender)) return
    const parsed = ShellCommand.safeParse(payload)
    if (parsed.success) handlers.command(parsed.data)
    else console.warn('[panel] dropped a malformed command:', parsed.error.issues[0]?.message)
  })
  ipcMain.on(panelChannelName('hide'), (event) => fromPanel(event.sender) && handlers.hide())
  ipcMain.on(panelChannelName('ready'), (event) => fromPanel(event.sender) && handlers.ready())

  return {
    attach(next: BrowserWindow): void {
      win = next
    },
    publish<K extends keyof ServerToPanel>(channel: K, payload: ServerToPanel[K]): void {
      if (win && !win.isDestroyed()) win.webContents.send(panelChannelName(channel), payload)
    },
  }
}

export type PanelChannel = ReturnType<typeof createPanelChannel>
