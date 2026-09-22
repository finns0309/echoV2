import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// One JSON file per key, written atomically (temp file + rename). A corrupt file
// reads as the fallback instead of crashing the app.
export interface JsonStore {
  get<T>(key: string, fallback: T): T
  set(key: string, value: unknown): void
}

export function createJsonStore(dir: string): JsonStore {
  mkdirSync(dir, { recursive: true })
  const file = (key: string) => {
    if (!/^[a-z0-9-]+$/.test(key)) throw new Error(`invalid store key: ${key}`)
    return join(dir, `${key}.json`)
  }

  return {
    get(key, fallback) {
      try {
        return JSON.parse(readFileSync(file(key), 'utf8'))
      } catch {
        return fallback
      }
    },
    set(key, value) {
      const target = file(key)
      const tmp = `${target}.${process.pid}.tmp`
      writeFileSync(tmp, JSON.stringify(value, null, 2))
      renameSync(tmp, target)
    },
  }
}

// In-memory store for tests.
export function createMemoryStore(): JsonStore {
  const data = new Map<string, string>()
  return {
    get(key, fallback) {
      const raw = data.get(key)
      return raw === undefined ? fallback : JSON.parse(raw)
    },
    set(key, value) {
      data.set(key, JSON.stringify(value))
    },
  }
}
