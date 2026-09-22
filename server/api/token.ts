import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const TOKEN_FILE = 'agent-token'

// The shared secret agents present as x-echo-token. Created once, kept in
// userData with owner-only permissions; the MCP adapter reads the same file.
export function loadOrCreateToken(dir: string): string {
  const file = join(dir, TOKEN_FILE)
  try {
    const existing = readFileSync(file, 'utf8').trim()
    if (existing) return existing
  } catch {
    // first run
  }
  mkdirSync(dir, { recursive: true })
  const token = randomBytes(24).toString('hex')
  writeFileSync(file, token, { mode: 0o600 })
  return token
}
