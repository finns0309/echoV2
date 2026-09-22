// A fullscreen fragment-shader pass: the boilerplate 流体 and 夜潮 share.
// One quad covering clip space, one program, uniform lookup, and a frame cap.

export const FULLSCREEN_VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`

function compile(gl: WebGLRenderingContext, src: string, type: number, label: string): WebGLShader {
  const s = gl.createShader(type)
  if (!s) throw new Error(`${label}: could not create shader`)
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`${label}: shader compile failed: ${gl.getShaderInfoLog(s)}`)
  return s
}

export interface FullscreenPass {
  gl: WebGLRenderingContext
  uniform(name: string): WebGLUniformLocation | null
  /** Resize the drawing buffer to `scale` × the canvas's CSS size. Returns true when it changed. */
  fit(scale: number): boolean
  draw(): void
  dispose(): void
}

/** Null when WebGL is unavailable; callers fall back to a flat background. */
export function createFullscreenPass(
  canvas: HTMLCanvasElement,
  fragment: string,
  { label = 'gl', contextAttributes = {} }: { label?: string; contextAttributes?: WebGLContextAttributes } = {},
): FullscreenPass | null {
  const gl = canvas.getContext('webgl', { antialias: false, ...contextAttributes })
  if (!gl) {
    console.warn(`[${label}] WebGL unavailable`)
    return null
  }
  const program = gl.createProgram()
  if (!program) throw new Error(`${label}: could not create program`)
  gl.attachShader(program, compile(gl, FULLSCREEN_VERT, gl.VERTEX_SHADER, label))
  gl.attachShader(program, compile(gl, fragment, gl.FRAGMENT_SHADER, label))
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`${label}: link failed: ${gl.getProgramInfoLog(program)}`)
  gl.useProgram(program)

  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)
  const aPos = gl.getAttribLocation(program, 'aPos')
  gl.enableVertexAttribArray(aPos)
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

  const uniforms = new Map<string, WebGLUniformLocation | null>()

  return {
    gl,
    uniform(name) {
      if (!uniforms.has(name)) uniforms.set(name, gl.getUniformLocation(program, name))
      return uniforms.get(name) ?? null
    },
    fit(scale) {
      const w = Math.max(1, Math.round(canvas.clientWidth * scale))
      const h = Math.max(1, Math.round(canvas.clientHeight * scale))
      if (canvas.width === w && canvas.height === h) return false
      canvas.width = w
      canvas.height = h
      gl.viewport(0, 0, w, h)
      return true
    },
    draw() {
      gl.drawArrays(gl.TRIANGLES, 0, 6)
    },
    dispose() {
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
    },
  }
}

/**
 * Caps painting at ~60fps (skips every other vsync on 120Hz ProMotion) and
 * reports the clamped seconds since the last painted frame, or null to skip.
 */
export function createFrameCap(minFrameMs = 1000 / 60 - 4, maxDt = 0.1) {
  let last = 0
  return (now: number): number | null => {
    if (last && now - last < minFrameMs) return null
    const dt = last ? Math.min(maxDt, (now - last) / 1000) : 1 / 60
    last = now
    return dt
  }
}
