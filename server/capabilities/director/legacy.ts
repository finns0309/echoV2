// Directions an earlier director left on disk, keyed by line of text: one JSON
// file per piece of content, {text: fields} or {text: "value"}. Their file names
// hash text we can no longer rebuild, so they are found by what they cover.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface LegacySource {
  /** A folder of {text: value} files. */
  dir: string
  /** Set when each value is a bare string: it becomes this field (e.g. 'kw'). */
  as?: string
}

type Fields = Record<string, unknown>
type TextMap = Map<string, Fields>

/** A file counts as the same content when it covers at least this share of its distinct lines. */
const MIN_COVERAGE = 0.9

function readSource({ dir, as }: LegacySource): TextMap[] {
  let names: string[]
  try {
    names = readdirSync(dir).filter((n) => n.endsWith('.json'))
  } catch {
    return []
  }
  return names.flatMap((name) => {
    try {
      const raw: unknown = JSON.parse(readFileSync(join(dir, name), 'utf8'))
      if (!raw || typeof raw !== 'object') return []
      const map: TextMap = new Map()
      for (const [text, value] of Object.entries(raw)) {
        if (as) {
          if (typeof value === 'string') map.set(text.trim(), { [as]: value })
        } else if (value && typeof value === 'object') map.set(text.trim(), value as Fields)
      }
      return map.size ? [map] : []
    } catch {
      return []
    }
  })
}

function bestCover(files: TextMap[], texts: string[]): TextMap | null {
  let best: TextMap | null = null
  let bestShare = 0
  for (const file of files) {
    const share = texts.filter((t) => file.has(t)).length / texts.length
    if (share > bestShare) {
      best = file
      bestShare = share
    }
  }
  return bestShare >= MIN_COVERAGE ? best : null
}

/**
 * Sources are read once, on first lookup. The first source decides whether the
 * content is known at all; later ones only add fields to lines it already has.
 */
export function createLegacyLookup(sources: LegacySource[]) {
  let loaded: TextMap[][] | null = null
  return (texts: string[]): Record<string, Fields> | null => {
    const distinct = [...new Set(texts.map((t) => t.trim()).filter(Boolean))]
    if (!distinct.length || !sources.length) return null
    loaded ??= sources.map(readSource)
    const [primary, ...extras] = loaded.map((files) => bestCover(files, distinct))
    if (!primary) return null
    const out: Record<string, Fields> = {}
    for (const text of distinct) {
      const fields = primary.get(text)
      if (!fields) continue
      out[text] = Object.assign({}, fields, ...extras.map((extra) => extra?.get(text) ?? {}))
    }
    return out
  }
}
