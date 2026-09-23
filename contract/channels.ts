// The one table of display-server <-> screen channels. Preload exposes it,
// the screen runtime subscribes to it, and any future transport (WebSocket for
// a phone screen) implements the same ScreenBridge.
//
// Type-only imports on purpose: preload bundles this file, and must not pull
// zod into a sandboxed preload.
import type { PanelCommand, ShellState } from './shell'
import type { SignalFrame, StageState } from './stage'

export interface ServerToScreen {
  stage: StageState
  signal: SignalFrame
  /** The panel is pointing at a window: that screen outlines itself with this name. Null: none. */
  highlight: { surface: string; name: string } | null
}

export interface ScreenToServer {
  ready: { screen: string }
}

export const SERVER_TO_SCREEN = ['stage', 'signal', 'highlight'] as const satisfies readonly (keyof ServerToScreen)[]
export const SCREEN_TO_SERVER = ['ready'] as const satisfies readonly (keyof ScreenToServer)[]

export function channelName(channel: keyof ServerToScreen | keyof ScreenToServer): string {
  return `echo:${channel}`
}

export interface ScreenBridge {
  on<K extends keyof ServerToScreen>(channel: K, listener: (payload: ServerToScreen[K]) => void): () => void
  send<K extends keyof ScreenToServer>(channel: K, payload: ScreenToServer[K]): void
}

// The panel: the control surface summoned by the hotkey. It reads the shell and
// the stage, and changes things only by sending commands: ShellCommands for the
// windows, StageCommands for what is on them.
export interface ServerToPanel {
  shell: ShellState
  stage: StageState
  /** The panel was just summoned: reset focus and selection. */
  shown: null
}

export interface PanelToServer {
  ready: null
  command: PanelCommand
  /** Put the panel away (Esc). */
  hide: null
  /** The height its content wants, in px; the window follows, top edge fixed. */
  resize: number
  /** The window the panel is pointing at (a row under the cursor, or the settings open), so it can be found on screen. */
  locate: string | null
}

export const SERVER_TO_PANEL = ['shell', 'stage', 'shown'] as const satisfies readonly (keyof ServerToPanel)[]
export const PANEL_TO_SERVER = ['ready', 'command', 'hide', 'resize', 'locate'] as const satisfies readonly (keyof PanelToServer)[]

export function panelChannelName(channel: keyof ServerToPanel | keyof PanelToServer): string {
  return `echo-panel:${channel}`
}

export interface PanelBridge {
  on<K extends keyof ServerToPanel>(channel: K, listener: (payload: ServerToPanel[K]) => void): () => void
  send<K extends keyof PanelToServer>(channel: K, payload: PanelToServer[K]): void
}
