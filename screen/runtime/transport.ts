import type { ScreenBridge } from '@contract/channels'

declare global {
  interface Window {
    echo?: ScreenBridge
  }
}

// The screen's only way to talk to the display server. On the desktop this is
// the preload bridge; a phone screen will provide the same ScreenBridge over WebSocket.
export function connect(): ScreenBridge {
  if (!window.echo) throw new Error('echo bridge missing: the preload script did not run')
  return window.echo
}
