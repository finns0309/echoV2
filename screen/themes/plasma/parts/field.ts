// The plasma field: one fullscreen fragment pass. Ported from echo's fx.js,
// driven by the host's frame clock instead of its own rAF loop.
import FRAG from './plasma.frag.glsl?raw'

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`

const PHASE_BASE_SPEED = 0.28 // units/s when idle
const PHASE_BEAT_BOOST = 1.6 // added speed when the beat is at 1
const MIN_FRAME_MS = 1000 / 60 - 4 // cap at ~60fps (skips every other vsync on 120Hz)
const RES_SCALE = 0.5 // a smooth field hides a half-res buffer completely: 1/4 the fragment cost
const OCTAVES = 3 // the original, softer look
const DEFAULT_ACCENT: [number, number, number] = [0.92, 0.22, 0.52] // hot magenta

function compile(gl: WebGLRenderingContext, src: string, type: number): WebGLShader {
  const s = gl.createShader(type)
  if (!s) throw new Error('plasma: could not create shader')
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`plasma: shader compile failed: ${gl.getShaderInfoLog(s)}`)
  return s
}

export function createField(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: false })
  if (!gl) {
    console.warn('[plasma] WebGL unavailable; showing the flat background only')
    return { frame: () => {}, pulse: () => {}, setAccent: () => {}, dispose: () => {} }
  }

  const prog = gl.createProgram()
  if (!prog) throw new Error('plasma: could not create program')
  gl.attachShader(prog, compile(gl, VERT, gl.VERTEX_SHADER))
  gl.attachShader(prog, compile(gl, FRAG, gl.FRAGMENT_SHADER))
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(`plasma: link failed: ${gl.getProgramInfoLog(prog)}`)
  gl.useProgram(prog)

  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)
  const aPos = gl.getAttribLocation(prog, 'aPos')
  gl.enableVertexAttribArray(aPos)
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

  const u = {
    time: gl.getUniformLocation(prog, 'uTime'),
    res: gl.getUniformLocation(prog, 'uRes'),
    beat: gl.getUniformLocation(prog, 'uBeat'),
    accent: gl.getUniformLocation(prog, 'uAccent'),
    octaves: gl.getUniformLocation(prog, 'uOctaves'),
  }

  let phase = 0
  let beat = 0
  let lastFrame = 0
  let accent = DEFAULT_ACCENT

  function resize(): void {
    const w = Math.max(1, Math.floor(canvas.clientWidth * RES_SCALE))
    const h = Math.max(1, Math.floor(canvas.clientHeight * RES_SCALE))
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
      gl!.viewport(0, 0, w, h)
    }
  }

  return {
    frame(now: number): void {
      if (lastFrame && now - lastFrame < MIN_FRAME_MS) return
      const dt = lastFrame ? Math.min(0.1, (now - lastFrame) / 1000) : 0.033
      lastFrame = now
      // A beat speeds the phase up; it decays by elapsed time so fps doesn't change the feel.
      phase += dt * (PHASE_BASE_SPEED + beat * PHASE_BEAT_BOOST)
      beat *= Math.pow(0.92, dt / 0.033)
      resize()
      gl.uniform1f(u.time, phase)
      gl.uniform1f(u.beat, beat)
      gl.uniform2f(u.res, canvas.width, canvas.height)
      gl.uniform3f(u.accent, accent[0], accent[1], accent[2])
      gl.uniform1f(u.octaves, OCTAVES)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
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
      gl.deleteBuffer(buf)
      gl.deleteProgram(prog)
    },
  }
}
