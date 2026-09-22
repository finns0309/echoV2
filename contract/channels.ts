// The one table of display-server <-> screen channels. Preload exposes it,
// the screen runtime subscribes to it, and any future transport (WebSocket for
// a phone screen) implements the same ScreenBridge.
//
// Type-only imports on purpose: preload bundles this file, and must not pull
// zod into a sandboxed preload.
import type { SignalFrame, StageState } from './stage'

export interface ServerToScreen {
  stage: StageState
  signal: SignalFrame
}

export interface ScreenToServer {
  ready: { screen: string }
}

export const SERVER_TO_SCREEN = ['stage', 'signal'] as const satisfies readonly (keyof ServerToScreen)[]
export const SCREEN_TO_SERVER = ['ready'] as const satisfies readonly (keyof ScreenToServer)[]

export function channelName(channel: keyof ServerToScreen | keyof ScreenToServer): string {
  return `echo:${channel}`
}

export interface ScreenBridge {
  on<K extends keyof ServerToScreen>(channel: K, listener: (payload: ServerToScreen[K]) => void): () => void
  send<K extends keyof ScreenToServer>(channel: K, payload: ScreenToServer[K]): void
}
