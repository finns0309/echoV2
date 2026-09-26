// Lines of type → points for the fireflies to hold. Each line is set on a canvas
// nobody sees and its inked pixels are sampled; the whole block is centred on a
// point and kept on the screen, and made coarser if it would take too many.
import { inked, wrap, type Line } from './glyphs'
import type { Target } from './swarm'

const FONT = '"PingFang SC", "Hiragino Sans", "Helvetica Neue", sans-serif'
const MAX_POINTS = 760 // fireflies in one formation, at most
const DENSITY = 9.5 // a line's size over its dot spacing
const LEADING = 1.25
const BAR = 10 // px between dots along a bar

const canvas = document.createElement('canvas')
const ctx = canvas.getContext('2d', { willReadFrequently: true })!

interface Row {
  text?: string
  bar?: number
  size: number
  lum: number
  width: number
}

function rows(lines: readonly Line[], base: number, max: number): Row[] {
  const out: Row[] = []
  for (const line of lines) {
    const size = base * line.scale
    if ('bar' in line) {
      out.push({ bar: line.bar, size: size * 0.5, lum: line.lum, width: Math.min(max, size * 7) })
      continue
    }
    ctx.font = `600 ${size}px ${FONT}`
    for (const text of wrap(line.text, (s) => ctx.measureText(s).width, max)) out.push({ text, size, lum: line.lum, width: ctx.measureText(text).width })
  }
  return out
}

/** Points for these lines, centred near (cx, cy) on a screen this big. */
export function spell(lines: readonly Line[], cx: number, cy: number, width: number, height: number): Target[] {
  if (!lines.length) return []
  const max = width * 0.72
  // Big enough to read from across the desk; smaller if it runs to many rows.
  let base = Math.min(128, Math.max(44, height * 0.09))
  let set = rows(lines, base, max)
  while (set.length > 3 && base > 34) set = rows(lines, (base *= 0.85), max)

  let coarse = 1
  for (;;) {
    const points: Target[] = []
    let y = 0
    const blockW = Math.max(...set.map((r) => r.width))
    for (const r of set) {
      const h = r.size * LEADING
      const x0 = (blockW - r.width) / 2
      if (r.bar !== undefined) {
        const n = Math.max(2, Math.round(r.width / (BAR * coarse)))
        for (let i = 0; i < n; i++) {
          const x = x0 + (i / (n - 1)) * r.width
          const lit = i / (n - 1) <= r.bar
          for (const dy of [-BAR * 0.45, BAR * 0.45]) points.push({ x, y: y + h / 2 + dy, lum: r.lum * (lit ? 1 : 0.22), dot: BAR * coarse })
        }
      } else if (r.text) {
        canvas.width = Math.ceil(r.width) + 4
        canvas.height = Math.ceil(h)
        ctx.font = `600 ${r.size}px ${FONT}`
        ctx.textBaseline = 'middle'
        ctx.fillStyle = '#000'
        ctx.fillText(r.text, 2, h / 2)
        const step = Math.max(3, (r.size / DENSITY) * coarse)
        for (const p of inked(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, step)) {
          points.push({ x: x0 + p.x - 2, y: y + p.y, lum: r.lum, dot: step })
        }
      }
      y += h
    }
    if (points.length > MAX_POINTS && coarse < 3) {
      coarse *= Math.sqrt(points.length / MAX_POINTS) * 1.02
      continue
    }
    // Centre the block on the point, kept a margin inside the screen.
    const m = 24
    const left = Math.min(width - m - blockW, Math.max(m, cx - blockW / 2))
    const top = Math.min(height - m - y, Math.max(m, cy - y / 2))
    return points.map((p) => ({ ...p, x: p.x + left, y: p.y + top }))
  }
}
