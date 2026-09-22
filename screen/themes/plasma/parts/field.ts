// The plasma field: one fullscreen fragment pass on the shared GL base.
// Ported from echo's fx.js, driven by the host's frame clock.
import { createFrameCap, createFullscreenPass } from '@screen/primitives/gl'
import FRAG from './plasma.frag.glsl?raw'

const PHASE_BASE_SPEED = 0.28 // units/s when idle
const PHASE_BEAT_BOOST = 1.6 // added speed when the beat is at 1
const RES_SCALE = 0.5 // a smooth field hides a half-res buffer completely: 1/4 the fragment cost
const OCTAVES = 3 // the original, softer look
const DEFAULT_ACCENT: [number, number, number] = [0.92, 0.22, 0.52] // hot magenta

export function createField(canvas: HTMLCanvasElement) {
  const pass = createFullscreenPass(canvas, FRAG, { label: 'plasma', contextAttributes: { alpha: true, premultipliedAlpha: false } })
  if (!pass) return { frame: () => {}, pulse: () => {}, setAccent: () => {}, dispose: () => {} }

  const { gl } = pass
  const cap = createFrameCap()
  let phase = 0
  let beat = 0
  let accent = DEFAULT_ACCENT

  return {
    frame(now: number): void {
      const dt = cap(now)
      if (dt === null) return
      // A beat speeds the phase up; it decays by elapsed time so fps doesn't change the feel.
      phase += dt * (PHASE_BASE_SPEED + beat * PHASE_BEAT_BOOST)
      beat *= Math.pow(0.92, dt / 0.033)
      pass.fit(RES_SCALE)
      gl.uniform1f(pass.uniform('uTime'), phase)
      gl.uniform1f(pass.uniform('uBeat'), beat)
      gl.uniform2f(pass.uniform('uRes'), canvas.width, canvas.height)
      gl.uniform3f(pass.uniform('uAccent'), accent[0], accent[1], accent[2])
      gl.uniform1f(pass.uniform('uOctaves'), OCTAVES)
      pass.draw()
    },

    /** Every text change: the flow briefly speeds up. */
    pulse(): void {
      beat = Math.min(1, beat + 0.65)
    },

    /** The mid-tone stop. Dark and bright stops stay fixed so contrast survives any color. */
    setAccent(rgb: [number, number, number] | null): void {
      if (!rgb) {
        accent = DEFAULT_ACCENT
        return
      }
      let [r, g, b] = rgb.map((c) => c / 255) as [number, number, number]
      const lum = 0.3 * r + 0.59 * g + 0.11 * b
      const SAT = 1.25 // mid-tones read better with a little more chroma
      r = Math.max(0, Math.min(1, lum + (r - lum) * SAT))
      g = Math.max(0, Math.min(1, lum + (g - lum) * SAT))
      b = Math.max(0, Math.min(1, lum + (b - lum) * SAT))
      accent = [r, g, b]
    },

    dispose(): void {
      pass.dispose()
    },
  }
}
