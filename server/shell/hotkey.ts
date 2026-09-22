import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'

export type HotkeyStatus = 'active' | 'needs-permission' | 'unavailable'

/**
 * ⌥ + right ⌘, which Electron's globalShortcut can't express (no left/right, no
 * modifier-only chords). A small native helper watches modifier keys and prints
 * "toggle"; this runs it and turns its lines into calls. Input Monitoring must be
 * granted to Echo for it to see keys.
 */
export function startHotkey(helper: string, handlers: { toggle: () => void; status: (s: HotkeyStatus) => void }) {
  let child: ChildProcess | null = null
  let stopped = false
  let restarts = 0

  function run(): void {
    if (!existsSync(helper)) return handlers.status('unavailable')
    child = spawn(helper, [], { stdio: ['pipe', 'pipe', 'inherit'] }) // our end of stdin closing tells it to exit
    let buffered = ''
    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => {
      buffered += chunk
      let nl: number
      while ((nl = buffered.indexOf('\n')) >= 0) {
        const line = buffered.slice(0, nl).trim()
        buffered = buffered.slice(nl + 1)
        if (line === 'toggle') handlers.toggle()
        else if (line === 'active' || line === 'needs-permission') handlers.status(line)
      }
    })
    child.on('exit', () => {
      child = null
      if (stopped) return
      if (++restarts > 5) return handlers.status('unavailable')
      setTimeout(run, 1000 * restarts)
    })
  }

  run()
  return {
    stop(): void {
      stopped = true
      child?.kill()
    },
  }
}
