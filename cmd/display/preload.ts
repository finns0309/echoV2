// Preload for every echo window. Sandboxed, so it may only import 'electron' and
// the type-only channel table. One file on purpose: a sandboxed preload can't load
// sibling chunks. A window gets one bridge, chosen by the argument its creator passed:
// screens get window.echo, the panel (--echo-panel) gets window.echoPanel.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import {
  PANEL_TO_SERVER,
  SCREEN_TO_SERVER,
  SERVER_TO_PANEL,
  SERVER_TO_SCREEN,
  channelName,
  panelChannelName,
  type PanelBridge,
  type ScreenBridge,
} from '@contract/channels'

function bridge<B>(inbound: readonly string[], outbound: readonly string[], name: (channel: never) => string): B {
  return {
    on(channel: string, listener: (payload: unknown) => void) {
      if (!inbound.includes(channel)) throw new Error(`unknown inbound channel: ${channel}`)
      const ipc = name(channel as never)
      const handler = (_event: IpcRendererEvent, payload: unknown) => listener(payload)
      ipcRenderer.on(ipc, handler)
      return () => {
        ipcRenderer.removeListener(ipc, handler)
      }
    },
    send(channel: string, payload: unknown) {
      if (!outbound.includes(channel)) throw new Error(`unknown outbound channel: ${channel}`)
      ipcRenderer.send(name(channel as never), payload)
    },
  } as B
}

if (process.argv.includes('--echo-panel')) {
  contextBridge.exposeInMainWorld('echoPanel', bridge<PanelBridge>(SERVER_TO_PANEL, PANEL_TO_SERVER, panelChannelName))
} else {
  contextBridge.exposeInMainWorld('echo', bridge<ScreenBridge>(SERVER_TO_SCREEN, SCREEN_TO_SERVER, channelName))
}
