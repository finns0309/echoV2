// Drawing the swarm on one canvas over the screen. A firefly is a dark body with a
// lantern at its tail: on a light desktop the bodies show, on a dark one the light
// does, so what they spell reads on either. The light is a soft sprite, added up
// where fireflies crowd, with a small hot core.
import type { Fly } from './swarm'

type Rgb = readonly [number, number, number]
export const FIREFLY: Rgb = [214, 255, 110] // yellow-green, as most of them are

const sprites = new Map<string, HTMLCanvasElement>()

/** A glow in this colour: a hot centre falling off to nothing. */
function sprite([r, g, b]: Rgb): HTMLCanvasElement {
  const key = `${r},${g},${b}`
  let s = sprites.get(key)
  if (!s) {
    s = document.createElement('canvas')
    s.width = s.height = 64
    const x = s.getContext('2d')!
    const grad = x.createRadialGradient(32, 32, 0, 32, 32, 32)
    grad.addColorStop(0, `rgb(${Math.min(255, r + 60)} ${Math.min(255, g + 40)} ${Math.min(255, b + 60)} / 1)`)
    grad.addColorStop(0.18, `rgb(${r} ${g} ${b} / 0.75)`)
    grad.addColorStop(0.45, `rgb(${r} ${g} ${b} / 0.18)`)
    grad.addColorStop(1, `rgb(${r} ${g} ${b} / 0)`)
    x.fillStyle = grad
    x.fillRect(0, 0, 64, 64)
    sprites.set(key, s)
  }
  return s
}

export function createSky(root: HTMLElement) {
  const canvas = document.createElement('canvas')
  canvas.className = 'ff-sky'
  root.append(canvas)
  const ctx = canvas.getContext('2d')!
  let w = 0
  let h = 0
  let dpr = 1

  return {
    draw(flies: readonly Fly[], width: number, height: number, size: number): void {
      const ratio = window.devicePixelRatio || 1
      if (width !== w || height !== h || ratio !== dpr) {
        w = width
        h = height
        dpr = ratio
        canvas.width = Math.round(w * dpr)
        canvas.height = Math.round(h * dpr)
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      // The bodies first, dark and small, facing the way they fly.
      ctx.globalCompositeOperation = 'source-over'
      ctx.fillStyle = 'rgb(38 32 22)'
      for (const f of flies) {
        if (f.alpha < 0.05) continue
        ctx.globalAlpha = f.alpha * 0.7
        ctx.beginPath()
        // Holding a letter, a little rounder and bigger, so the letters read on a light desktop.
        const held = f.target && f.wait === 0 && f.target.dot
        const rx = held ? held * 0.36 : 1.9 * size
        const ry = held ? held * 0.3 : 1.1 * size
        ctx.ellipse(f.x, f.y, rx, ry, Math.atan2(f.vy, f.vx), 0, Math.PI * 2)
        ctx.fill()
      }
      // Then the light, added up where they crowd.
      ctx.globalCompositeOperation = 'lighter'
      for (const f of flies) {
        const a = f.glow * f.alpha
        if (a < 0.02) continue
        const r = f.target ? (f.target.dot ?? 6) * 1.4 : (7 + 9 * f.glow) * size
        // The lantern is at the tail, just behind it.
        const v = Math.hypot(f.vx, f.vy) || 1
        const lx = f.x - (f.vx / v) * 1.6 * size
        const ly = f.y - (f.vy / v) * 1.6 * size
        ctx.globalAlpha = Math.min(1, a)
        ctx.drawImage(sprite(f.target?.tint ?? FIREFLY), lx - r, ly - r, r * 2, r * 2)
      }
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
    },
    remove(): void {
      canvas.remove()
    },
  }
}
