// Executable architecture: scans the real repository against architecture/rules.ts.
// Rules are explained in docs/ARCHITECTURE.md §4.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ThemeManifest } from '@contract'
import { SCREEN_NETWORK, THEME_FORBIDDEN_WORDS, checkImport, importsOf } from './rules'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE_ROOTS = ['contract', 'server', 'screen', 'panel', 'cmd']

function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    return entry.isDirectory() ? walk(full) : [full]
  })
}

const rel = (full: string) => relative(ROOT, full).split('\\').join('/')
const sources = SOURCE_ROOTS.flatMap((r) => walk(join(ROOT, r)))
  .map(rel)
  .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.endsWith('.d.ts'))
const read = (file: string) => readFileSync(join(ROOT, file), 'utf8')
const unitIds = (dir: string) =>
  existsSync(join(ROOT, dir))
    ? readdirSync(join(ROOT, dir), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
    : []

const themeIds = unitIds('screen/themes')
const packIds = unitIds('server/packs')

describe('dependency directions', () => {
  it('every import respects the layer rules', () => {
    const violations = sources.flatMap((file) =>
      importsOf(read(file)).flatMap((spec) => checkImport(file, spec) ?? []),
    )
    expect(violations).toEqual([])
  })
})

describe('themes', () => {
  it('every theme directory has theme.ts and a manifest that matches its folder', async () => {
    const problems: string[] = []
    for (const id of themeIds) {
      const dir = join(ROOT, 'screen/themes', id)
      if (!existsSync(join(dir, 'theme.ts'))) problems.push(`${id}: missing theme.ts`)
      if (!existsSync(join(dir, 'manifest.ts'))) {
        problems.push(`${id}: missing manifest.ts`)
        continue
      }
      const parsed = ThemeManifest.safeParse((await import(join(dir, 'manifest.ts'))).default)
      if (!parsed.success) problems.push(`${id}: invalid manifest (${parsed.error.message})`)
      else if (parsed.data.id !== id) problems.push(`${id}: manifest id is "${parsed.data.id}"`)
    }
    expect(problems).toEqual([])
  })

  it('no theme knows content-specific words (unless it declares kinds: [song])', () => {
    const offenders = sources
      .filter((f) => f.startsWith('screen/themes/'))
      .filter((f) => {
        const id = f.split('/')[2]!
        const manifest = join(ROOT, 'screen/themes', id, 'manifest.ts')
        const songOnly = existsSync(manifest) && /kinds:\s*\[[^\]]*'song'/.test(readFileSync(manifest, 'utf8'))
        return !songOnly && THEME_FORBIDDEN_WORDS.test(read(f))
      })
    expect(offenders).toEqual([])
  })
})

describe('packs', () => {
  it('every pack directory has a pack.ts', () => {
    expect(packIds.filter((id) => !existsSync(join(ROOT, 'server/packs', id, 'pack.ts')))).toEqual([])
  })
})

describe('the core stays generic', () => {
  it('the stage and the screen runtime never name a theme or a pack', () => {
    const names = [...themeIds, ...packIds]
    const offenders = sources
      .filter((f) => f.startsWith('server/stage/') || f.startsWith('screen/runtime/'))
      .flatMap((f) => names.filter((n) => new RegExp(`['"\`]${n}['"\`]`).test(read(f))).map((n) => `${f} names "${n}"`))
    expect(offenders).toEqual([])
  })

  it('screen code makes no network requests (the transport is the only door)', () => {
    const offenders = sources
      .filter((f) => f.startsWith('screen/') || f.startsWith('cmd/screen/') || f.startsWith('panel/') || f.startsWith('cmd/panel/'))
      .filter((f) => !/^screen\/runtime\/transport[^/]*\.ts$/.test(f))
      .filter((f) => SCREEN_NETWORK.test(read(f)))
    expect(offenders).toEqual([])
  })
})
