// A palette from a picture (an album cover, an avatar): the most vivid color
// first, then the average. Ported from echo's app.js extractAccent: a 24×24
// sample, preferring saturated, mid-bright pixels. Results are cached per URL.

const cache = new Map<string, Promise<string[] | null>>()

/** '#rrggbb' (as palettes are written) → [r, g, b] in 0–255, or null for anything else. */
export function hexToRgb(color: string | undefined): [number, number, number] | null {
  const m = color?.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  return m ? [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)] : null
}

const hex = (r: number, g: number, b: number) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')

function sample(url: string): Promise<string[] | null> {
  return new Promise((resolve) => {
    const img = new Image()
    // Needed for getImageData on cross-origin images; the cover CDN sends CORS headers.
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const c = document.createElement('canvas')
        c.width = c.height = 24
        const ctx = c.getContext('2d')
        if (!ctx) return resolve(null)
        ctx.drawImage(img, 0, 0, 24, 24)
        const d = ctx.getImageData(0, 0, 24, 24).data
        let best = -1
        let vivid: [number, number, number] = [255, 255, 255]
        let ar = 0
        let ag = 0
        let ab = 0
        let n = 0
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i]!
          const g = d[i + 1]!
          const b = d[i + 2]!
          ar += r
          ag += g
          ab += b
          n++
          const mx = Math.max(r, g, b)
          const mn = Math.min(r, g, b)
          const sat = mx === 0 ? 0 : (mx - mn) / mx
          const score = sat * 2 + (1 - Math.abs((r + g + b) / 3 - 150) / 200)
          if (score > best) {
            best = score
            vivid = [r, g, b]
          }
        }
        resolve([hex(...vivid), hex(ar / n, ag / n, ab / n)])
      } catch {
        resolve(null) // a tainted canvas: no CORS on this image
      }
    }
    img.onerror = () => resolve(null)
    img.src = url
  })
}

export function paletteFromImage(url: string): Promise<string[] | null> {
  let p = cache.get(url)
  if (!p) {
    p = sample(url)
    cache.set(url, p)
  }
  return p
}
