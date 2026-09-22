import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface Secrets {
  openaiApiKey?: string
  openaiModel?: string
  openaiBaseUrl?: string
}

export const SECRETS_FILE = 'secrets.json'

// secrets.json lives in userData, never in the repository. Missing or broken
// reads as {}: features that need a key simply stay off.
export function loadSecrets(dir: string): Secrets {
  try {
    const raw: unknown = JSON.parse(readFileSync(join(dir, SECRETS_FILE), 'utf8'))
    if (!raw || typeof raw !== 'object') return {}
    const s = raw as Record<string, unknown>
    const str = (k: string) => (typeof s[k] === 'string' && s[k] ? (s[k] as string) : undefined)
    return {
      ...(str('openaiApiKey') ? { openaiApiKey: str('openaiApiKey') } : {}),
      ...(str('openaiModel') ? { openaiModel: str('openaiModel') } : {}),
      ...(str('openaiBaseUrl') ? { openaiBaseUrl: str('openaiBaseUrl') } : {}),
    }
  } catch {
    return {}
  }
}
