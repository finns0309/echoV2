// The shell: echo's windows and what the user can do to them. The display server
// is the only writer; the tray and the panel read ShellState and send ShellCommands.
import { z } from 'zod'

export const ShellWindow = z.object({
  id: z.string().min(1),
  /** The user's name for it, which agents use to prefer it. */
  name: z.string().min(1),
  theme: z.string(),
  /** One of ShellState.routes: what this window takes. */
  route: z.string(),
  visible: z.boolean(),
  clickThrough: z.boolean(),
  /** normal; restorable: filled by the user and can go back; full: its theme is full-screen anyway. */
  fill: z.enum(['normal', 'restorable', 'full']),
  /** The fallback window: can't be closed or renamed, takes what no visible window does. */
  main: z.boolean(),
})
export type ShellWindow = z.infer<typeof ShellWindow>

const Choice = z.object({ id: z.string().min(1), label: z.string().min(1) })

export const ShellState = z.object({
  windows: z.array(ShellWindow),
  themes: z.array(Choice),
  routes: z.array(Choice),
  /** Names a window can be given. */
  names: z.array(z.string().min(1)),
  presets: z.array(Choice),
})
export type ShellState = z.infer<typeof ShellState>

const onWindow = { window: z.string().min(1) }

export const ShellCommand = z.discriminatedUnion('type', [
  z.object({ type: z.literal('setTheme'), ...onWindow, theme: z.string().min(1) }),
  z.object({ type: z.literal('setRoute'), ...onWindow, route: z.string().min(1) }),
  z.object({ type: z.literal('rename'), ...onWindow, name: z.string().min(1).max(40) }),
  z.object({ type: z.literal('addWindow'), theme: z.string().min(1).optional() }),
  z.object({ type: z.literal('closeWindow'), ...onWindow }),
  z.object({ type: z.literal('toggleVisible'), ...onWindow }),
  z.object({ type: z.literal('toggleClickThrough'), ...onWindow }),
  z.object({ type: z.literal('toggleFill'), ...onWindow }),
  z.object({ type: z.literal('resetWindow'), ...onWindow }),
  z.object({ type: z.literal('applyPreset'), preset: z.string().min(1) }),
])
export type ShellCommand = z.infer<typeof ShellCommand>
