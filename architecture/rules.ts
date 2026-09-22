// The dependency rules from docs/ARCHITECTURE.md §4, as code.
// Paths are repo-relative with forward slashes, e.g. "screen/themes/furin/theme.ts".
import { builtinModules } from 'node:module'
import { posix } from 'node:path'

/** The ownership zone of a file: a layer, plus the unit id for sliced layers. */
export function zoneOf(file: string): string | null {
  const [root, second, third] = file.split('/')
  if (root === 'contract' || root === 'architecture') return root
  if (root === 'cmd') return second ? `cmd/${second}` : null
  if (root === 'server') {
    if (!second) return null
    if (second === 'providers' || second === 'capabilities' || second === 'packs') {
      return third ? `server/${second}/${third}` : `server/${second}`
    }
    return `server/${second}`
  }
  if (root === 'screen') {
    if (!second) return null
    if (second === 'themes' || second === 'primitives') return third ? `screen/${second}/${third}` : `screen/${second}`
    return `screen/${second}`
  }
  return null
}

/** The layer of a zone: the zone with its unit id dropped. */
export function layerOf(zone: string): string {
  const parts = zone.split('/')
  const sliced = ['server/providers', 'server/capabilities', 'server/packs', 'screen/themes', 'screen/primitives']
  const two = parts.slice(0, 2).join('/')
  return sliced.includes(two) ? two : zone
}

// Which other layers each layer may import. Importing inside your own zone is always fine.
const ALLOWED: Record<string, readonly string[]> = {
  contract: [],
  'server/foundation': ['contract'],
  'server/providers': ['server/foundation'],
  'server/capabilities': ['server/foundation', 'contract'],
  'server/packs': ['server/capabilities', 'server/foundation', 'contract'],
  'server/stage': ['server/foundation', 'contract'],
  'server/shell': ['server/foundation', 'server/stage', 'contract'],
  'server/api': ['server/foundation', 'server/stage', 'contract'],
  'screen/primitives': ['screen/primitives', 'contract'],
  'screen/runtime': ['screen/primitives', 'screen/tokens', 'contract'],
  'screen/tokens': [],
  'screen/themes': ['screen/primitives', 'screen/tokens', 'contract'],
}

// Public seams: single files another layer may use even though the layer itself is off limits.
const SEAMS: Record<string, readonly RegExp[]> = {
  'server/packs': [/^server\/stage\/pack-api(\.ts)?$/],
  'screen/themes': [/^screen\/runtime\/theme-api(\.ts)?$/],
}

// Only these zones may touch Electron.
const ELECTRON_ZONES = ['server/shell', 'server/api', 'cmd/display']

export type Target = { kind: 'local'; path: string } | { kind: 'package'; name: string; builtin: boolean }

/** Resolve an import specifier written in `from` to a repo path or a package. */
export function resolveImport(from: string, spec: string): Target {
  if (spec.startsWith('.')) return { kind: 'local', path: posix.normalize(posix.join(posix.dirname(from), spec)) }
  if (spec === '@contract') return { kind: 'local', path: 'contract/index.ts' }
  for (const alias of ['contract', 'server', 'screen']) {
    if (spec.startsWith(`@${alias}/`)) return { kind: 'local', path: `${alias}/${spec.slice(alias.length + 2)}` }
  }
  const name = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]!
  const bare = name.replace(/^node:/, '')
  return { kind: 'package', name, builtin: spec.startsWith('node:') || builtinModules.includes(bare) }
}

/** Returns a human-readable violation, or null when the import is allowed. */
export function checkImport(from: string, spec: string): string | null {
  const fromZone = zoneOf(from)
  if (!fromZone || fromZone === 'architecture') return null
  const fromLayer = layerOf(fromZone)
  const target = resolveImport(from, spec)

  if (target.kind === 'package') {
    if (target.name === 'electron' && !ELECTRON_ZONES.includes(fromZone)) {
      return `${from}: only ${ELECTRON_ZONES.join(', ')} may import electron`
    }
    const browserSide = fromZone === 'contract' || fromLayer.startsWith('screen/') || fromZone === 'cmd/screen'
    if (target.builtin && browserSide) return `${from}: ${fromZone} must not import Node built-in "${target.name}"`
    if (from === 'cmd/display/preload.ts' && target.name !== 'electron') {
      return `${from}: the sandboxed preload may only import electron and contract/channels`
    }
    return null
  }

  const to = target.path
  const toZone = zoneOf(to)
  if (!toZone) return `${from}: imports "${spec}", which is outside every known zone`
  if (toZone === fromZone) return null

  if (fromZone.startsWith('cmd/')) return checkEntryImport(from, fromZone, to, toZone)

  if (SEAMS[fromLayer]?.some((seam) => seam.test(to))) return null
  const allowed = ALLOWED[fromLayer]
  if (!allowed) return `${from}: no dependency rule for layer ${fromLayer}`
  if (!allowed.includes(layerOf(toZone)) && !allowed.includes(toZone)) {
    return `${from}: ${fromLayer} must not import ${toZone} ("${spec}")`
  }
  return null
}

// Entry points may see several layers, but only through each unit's public door.
function checkEntryImport(from: string, fromZone: string, to: string, toZone: string): string | null {
  const toLayer = layerOf(toZone)
  if (fromZone === 'cmd/mcp' && toZone !== 'contract') return `${from}: the MCP adapter may only import contract`
  if (from === 'cmd/display/preload.ts' && !to.startsWith('contract/channels')) {
    return `${from}: the sandboxed preload may only import electron and contract/channels`
  }
  if (fromZone === 'cmd/screen' && to.startsWith('server/')) return `${from}: a screen must not import the server`
  if (fromZone === 'cmd/display' && to.startsWith('screen/')) {
    if (!/^screen\/themes\/[^/]+\/(manifest|grammar)(\.ts)?$/.test(to)) {
      return `${from}: the display server may only load theme manifests and grammars, not ${to}`
    }
  }
  if (toLayer === 'server/packs' && !/^server\/packs\/[^/]+\/pack(\.ts)?$/.test(to)) {
    return `${from}: use a pack through its pack.ts, not ${to}`
  }
  if (fromZone === 'cmd/screen' && toLayer === 'screen/themes' && !/^screen\/themes\/[^/]+\/theme(\.ts)?$/.test(to)) {
    return `${from}: load a theme through its theme.ts, not ${to}`
  }
  return null
}

const IMPORT_RE =
  /(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|import\.meta\.glob(?:<[^>]*>)?\(\s*['"]([^'"]+)['"]/g

/** Every module specifier a source file refers to, including dynamic imports and globs. */
export function importsOf(source: string): string[] {
  const specs: string[] = []
  for (const m of source.matchAll(IMPORT_RE)) {
    const spec = m[1] ?? m[2] ?? m[3]
    if (spec) specs.push(spec)
  }
  return specs
}

/** Words a theme must not know. Content-specific knowledge lives in packs. */
export const THEME_FORBIDDEN_WORDS = /song|lyric|netease|\bmuse\b/i

/** Screen code must not reach the network; only the transport talks to the server. */
export const SCREEN_NETWORK = /\bfetch\(|new WebSocket\(|XMLHttpRequest|new EventSource\(|sendBeacon\(/
