// Preload: exposes the channel table from contract/channels as window.echo.
// Sandboxed, so it may only import 'electron' and the type-only channel table.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { SCREEN_TO_SERVER, SERVER_TO_SCREEN, channelName, type ScreenBridge } from '@contract/channels'

const inbound: readonly string[] = SERVER_TO_SCREEN
const outbound: readonly string[] = SCREEN_TO_SERVER

const bridge: ScreenBridge = {
  on(channel, listener) {
    if (!inbound.includes(channel)) throw new Error(`unknown inbound channel: ${channel}`)
    const name = channelName(channel)
    const handler = (_event: IpcRendererEvent, payload: unknown) => listener(payload as never)
    ipcRenderer.on(name, handler)
    return () => {
      ipcRenderer.removeListener(name, handler)
    }
  },
  send(channel, payload) {
    if (!outbound.includes(channel)) throw new Error(`unknown outbound channel: ${channel}`)
    ipcRenderer.send(channelName(channel), payload)
  },
}

contextBridge.exposeInMainWorld('echo', bridge)
