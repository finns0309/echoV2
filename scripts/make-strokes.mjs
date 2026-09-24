// Turns KanjiVG (https://kanjivg.tagaini.net, CC BY-SA 3.0, © Ulrich Apel) into the
// stroke data もち writes with: { "字": ["M…", "M…", …] }, each character's strokes
// as SVG paths in a 109×109 box, in stroke order. Kana and kanji only, coordinates to
// a tenth, and split by Unicode block of 256 (strokes/4e.json holds U+4E00–U+4EFF)
// so writing a word loads only the few blocks its characters are in.
//
//   node scripts/make-strokes.mjs kanjivg-20250816.xml
//
// Download the XML from https://github.com/KanjiVG/kanjivg/releases (the .xml.gz,
// unzipped); it isn't kept in the repository, only what this makes from it.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'

const [input] = process.argv.slice(2)
if (!input) throw new Error('usage: node scripts/make-strokes.mjs <kanjivg.xml>')
const OUT = new URL('../screen/themes/mochi/parts/strokes/', import.meta.url)

const xml = readFileSync(input, 'utf8')
const kana = (c) => c >= 0x3041 && c <= 0x30ff
const kanji = (c) => (c >= 0x3400 && c <= 0x4dbf) || (c >= 0x4e00 && c <= 0x9fff) || c === 0x3005 // 々
/** A path with its numbers to a tenth: far finer than a stroke's width in a 109 box. */
const tenths = (d) =>
  d
    .replace(/-?\d*\.\d+/g, (n) => String(Math.round(Number(n) * 10) / 10))
    .replace(/\s+/g, ' ')
    .replace(/,?\s*-/g, (m) => (m.includes(',') ? ',-' : '-'))
    .trim()
const strokes = {} // block → character → paths
for (const [, hex, body] of xml.matchAll(/<kanji id="kvg:kanji_([0-9a-f]+)">([\s\S]*?)<\/kanji>/g)) {
  const code = parseInt(hex, 16)
  if (!kana(code) && !kanji(code)) continue
  const paths = [...body.matchAll(/<path id="kvg:[0-9a-f]+-s(\d+)"[^>]*? d="([^"]+)"/g)]
    .sort((a, b) => Number(a[1]) - Number(b[1]))
    .map(([, , d]) => tenths(d))
  if (!paths.length) continue
  const block = (code >> 8).toString(16)
  ;(strokes[block] ??= {})[String.fromCodePoint(code)] = paths
}
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT)
for (const [block, chars] of Object.entries(strokes)) writeFileSync(new URL(`${block}.json`, OUT), JSON.stringify(chars))
console.log(`${Object.values(strokes).reduce((n, b) => n + Object.keys(b).length, 0)} characters in ${Object.keys(strokes).length} blocks → ${OUT.pathname}`)
