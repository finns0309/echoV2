// Composition root for the display server (Electron main process).
// Assembly only: construct the layers, wire them together, open surfaces.
import { fileURLToPath } from 'node:url'
import { app, type BrowserWindow } from 'electron'
import { createScreenChannel } from '@server/api/screen-channel'
import { openSurface } from '@server/shell/surfaces'
import { createStage } from '@server/stage/state'

const PRELOAD = fileURLToPath(new URL('../preload/preload.cjs', import.meta.url))
const SCREEN_HTML = fileURLToPath(new URL('../renderer/index.html', import.meta.url))

function loadScreen(win: BrowserWindow, surface: string): Promise<void> {
  const devUrl = process.env.ELECTRON_RENDERER_URL
  return devUrl
    ? win.loadURL(`${devUrl}?surface=${encodeURIComponent(surface)}`)
    : win.loadFile(SCREEN_HTML, { query: { surface } })
}

app.whenReady().then(() => {
  const stage = createStage({ main: { profile: 'hanging', theme: '', slots: {} } })
  const channel = createScreenChannel()

  channel.onReady(() => channel.publish('stage', stage.snapshot()))
  stage.subscribe((state) => channel.publish('stage', state))

  const win = openSurface({ profile: 'hanging', preload: PRELOAD })
  channel.attach(win)
  void loadScreen(win, 'main')
})

app.on('window-all-closed', () => app.quit())
