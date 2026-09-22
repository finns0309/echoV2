import type { PanelBridge } from '@contract/channels'

declare global {
  interface Window {
    echoPanel?: PanelBridge
  }
}

// The panel's only door to the display server: the preload bridge.
export function connect(): PanelBridge {
  if (!window.echoPanel) throw new Error('panel bridge missing: the preload script did not run')
  return window.echoPanel
}
