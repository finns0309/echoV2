// Proves the rule engine catches what it should, so a green dependency check
// means something even while the repository is still small.
import { describe, expect, it } from 'vitest'
import { checkImport, importsOf, zoneOf } from './rules'

const ok = (from: string, spec: string) => expect(checkImport(from, spec)).toBeNull()
const bad = (from: string, spec: string) => expect(checkImport(from, spec)).not.toBeNull()

describe('zones', () => {
  it('slices packs, themes, providers, capabilities and primitives by unit', () => {
    expect(zoneOf('server/packs/card/model.ts')).toBe('server/packs/card')
    expect(zoneOf('screen/themes/furin/parts/physics.ts')).toBe('screen/themes/furin')
    expect(zoneOf('server/stage/scheduler.ts')).toBe('server/stage')
    expect(zoneOf('cmd/display/main.ts')).toBe('cmd/display')
  })
})

describe('server layers', () => {
  it('lets packs use capabilities, foundation and the contract', () => {
    ok('server/packs/card/pack.ts', '@server/capabilities/director/service')
    ok('server/packs/card/pack.ts', '@contract')
    ok('server/packs/card/pack.ts', './model')
  })
  it('keeps packs away from providers, other packs, the stage and the screen', () => {
    bad('server/packs/music/pack.ts', '@server/providers/muse/now')
    bad('server/packs/music/pack.ts', '../card/model')
    bad('server/packs/music/pack.ts', '@server/stage/scheduler')
    bad('server/packs/music/pack.ts', '@screen/themes/tide/theme')
  })
  it('keeps capabilities from importing providers directly', () => {
    bad('server/capabilities/director/service.ts', '@server/providers/llm/responses')
  })
  it('keeps the stage free of packs', () => {
    bad('server/stage/scheduler.ts', '@server/packs/card/pack')
  })
  it('confines electron to the shell, the api and the display entry', () => {
    ok('server/shell/surfaces.ts', 'electron')
    bad('server/stage/state.ts', 'electron')
    bad('server/packs/card/pack.ts', 'electron')
  })
})

describe('screen layers', () => {
  it('lets a theme use primitives, tokens, the contract and its own parts', () => {
    ok('screen/themes/furin/theme.ts', '@screen/primitives/text/segment')
    ok('screen/themes/furin/theme.ts', './parts/physics')
    ok('screen/themes/furin/theme.ts', '@contract')
  })
  it('keeps themes apart and away from the runtime and the server', () => {
    bad('screen/themes/furin/theme.ts', '../tide/parts/shader')
    bad('screen/themes/furin/theme.ts', '@screen/runtime/host')
    bad('screen/themes/furin/theme.ts', '@server/stage/state')
  })
  it('keeps Node built-ins out of the screen and the contract', () => {
    bad('screen/runtime/host.ts', 'node:fs')
    bad('screen/primitives/text/segment.ts', 'path')
    bad('contract/content.ts', 'node:crypto')
  })
})

describe('entry points', () => {
  it('lets the display server load only theme manifests and grammars', () => {
    ok('cmd/display/main.ts', '../../screen/themes/furin/manifest.ts')
    ok('cmd/display/main.ts', '../../screen/themes/*/grammar.ts')
    bad('cmd/display/main.ts', '../../screen/themes/furin/theme.ts')
  })
  it('makes packs reachable only through pack.ts', () => {
    ok('cmd/display/main.ts', '@server/packs/card/pack')
    bad('cmd/display/main.ts', '@server/packs/card/model')
  })
  it('keeps the screen entry away from the server', () => {
    bad('cmd/screen/boot.ts', '@server/stage/state')
    ok('cmd/screen/boot.ts', '../../screen/themes/*/theme.ts')
  })
  it('keeps the sandboxed preload down to electron and the channel table', () => {
    ok('cmd/display/preload.ts', 'electron')
    ok('cmd/display/preload.ts', '@contract/channels')
    bad('cmd/display/preload.ts', '@contract')
    bad('cmd/display/preload.ts', 'zod')
  })
})

describe('import extraction', () => {
  it('finds static, type-only, dynamic and glob imports', () => {
    const src = `
      import a from './a'
      import type { B } from '@contract'
      export * from './c'
      const d = await import('./d')
      const e = import.meta.glob<{ default: unknown }>('../../screen/themes/*/theme.ts')
    `
    expect(importsOf(src)).toEqual(['./a', '@contract', './c', './d', '../../screen/themes/*/theme.ts'])
  })
})
