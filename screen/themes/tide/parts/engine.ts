// The 夜潮 engine: text rasterization, per-unit "spoken at" maps, live waves,
// and the per-frame uniforms. Ported from echo's tide.js; behavior and tuning
// are unchanged, the state now lives per instance.
//
// One stateless fragment pass: the waterline is a known function of time, so
// "when was this point last covered / when did the front cross it" is solved
// analytically, with no feedback buffers. The shader runs on the wall clock
// (waves keep rolling while the content is paused); line waves launch when
// the CONTENT clock crosses their start.
import { createFrameCap, createFullscreenPass } from '@screen/primitives/gl'
import { segment } from '@screen/primitives/text'
import FRAG from './tide.frag.glsl?raw'
import { ARRIVE_END, HOLD, TB, TU, scheduleWaves, type TimedLine } from './waves'

const NW = 6 // waves the shader tracks at once; must match the shader's arrays
const FONT = '"Hiragino Sans","PingFang SC",system-ui,sans-serif'
const DEFAULT_ACCENT: [number, number, number] = [0.2, 0.55, 0.95]

interface Wave {
  t0: number
  R: number
  seed: number
  Tu: number
  Tb: number
  foam: number
  line: boolean
}

function canvas2d() {
  const c = document.createElement('canvas')
  const x = c.getContext('2d')
  if (!x) throw new Error('tide: 2d canvas unavailable')
  return [c, x] as const
}

export function createTideEngine(root: HTMLElement) {
  const cv = document.createElement('canvas')
  root.appendChild(cv)
  const pass = createFullscreenPass(cv, FRAG, { label: 'tide', contextAttributes: { alpha: false } })
  const noop = { setLines: () => {}, clear: () => {}, setAccent: () => {}, energy: () => {}, onset: () => {}, frame: () => {}, dispose: () => {} }
  if (!pass) return noop
  const { gl } = pass

  // R = current line, G = its blurred halo, B = the leaving line
  const [cur, curx] = canvas2d()
  const [prev, prevx] = canvas2d()
  const [comp, cctx] = canvas2d()
  const [tmp, tctx] = canvas2d()
  // birth maps: per-unit "spoken at" codes (gray = seconds into the line / span)
  const [bcur, bcurx] = canvas2d()
  const [bprev, bprevx] = canvas2d()
  const [bcomp, bcctx] = canvas2d()
  let curSpan = 6
  let prevSpan = 6

  const texture = () => {
    const t = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, t)
    for (const [k, v] of [
      [gl.TEXTURE_MIN_FILTER, gl.LINEAR],
      [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
      [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE],
      [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE],
    ] as const)
      gl.texParameteri(gl.TEXTURE_2D, k, v)
    return t
  }
  const tex = texture()
  const texB = texture()

  let lines: TimedLine[] = []
  let lineWaves: number[] = []
  let waves: Wave[] = []
  let curIdx = -2
  let prevGoneAt = 0
  let holdNewUntil = 0
  let curLineTime = 0
  let prevLineTime = 0
  let handed = false
  let lastContent = -1
  let nextWavelet = 0
  let seedN = 1
  let accent = DEFAULT_ACCENT
  let beat = 0
  let energy = 0.45
  let energyTarget = 0.45
  let energyAt = -Infinity
  let dirty = true
  const t00 = performance.now() / 1000
  const cap = createFrameCap()
  const wall = () => performance.now() / 1000

  // Buffer at ≤1.25× CSS px: the field is smooth so it hides the upscale, the
  // text is rasterized at buffer resolution so it stays crisp enough.
  function fit(): void {
    const S = Math.min(window.devicePixelRatio || 1, 1.25)
    if (!pass!.fit(S)) return
    for (const c of [cur, prev, comp, tmp, bcur, bprev, bcomp]) {
      c.width = cv.width
      c.height = cv.height
    }
    prevx.clearRect(0, 0, prev.width, prev.height)
    layout(lines[curIdx] ?? null)
    dirty = true
  }

  function upload(): void {
    const tint = (src: HTMLCanvasElement, color: string, blur: number) => {
      tctx.globalCompositeOperation = 'source-over'
      tctx.clearRect(0, 0, tmp.width, tmp.height)
      tctx.filter = blur ? `blur(${blur}px)` : 'none'
      tctx.drawImage(src, 0, 0)
      tctx.filter = 'none'
      tctx.globalCompositeOperation = 'source-in'
      tctx.fillStyle = color
      tctx.fillRect(0, 0, tmp.width, tmp.height)
      cctx.drawImage(tmp, 0, 0)
    }
    cctx.globalCompositeOperation = 'source-over'
    cctx.fillStyle = '#000'
    cctx.fillRect(0, 0, comp.width, comp.height)
    cctx.globalCompositeOperation = 'lighter'
    tint(cur, '#f00', 0)
    tint(cur, '#0f0', cur.height * 0.02)
    tint(prev, '#00f', 0)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, comp)
    // birth codes: R = current line, G = leaving line ('multiply' keeps one channel of a gray map)
    const chan = (src: HTMLCanvasElement, color: string) => {
      tctx.globalCompositeOperation = 'source-over'
      tctx.filter = 'none'
      tctx.fillStyle = '#000'
      tctx.fillRect(0, 0, tmp.width, tmp.height)
      tctx.drawImage(src, 0, 0)
      tctx.globalCompositeOperation = 'multiply'
      tctx.fillStyle = color
      tctx.fillRect(0, 0, tmp.width, tmp.height)
      bcctx.drawImage(tmp, 0, 0)
    }
    bcctx.globalCompositeOperation = 'source-over'
    bcctx.fillStyle = '#000'
    bcctx.fillRect(0, 0, bcomp.width, bcomp.height)
    bcctx.globalCompositeOperation = 'lighter'
    chan(bcur, '#f00')
    chan(bprev, '#0f0')
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, texB)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bcomp)
    gl.activeTexture(gl.TEXTURE0)
    dirty = false
  }

  // Rows: the text's own spaces are phrase boundaries (2–3 phrases → one row
  // each); otherwise split at word boundaries only when one row would set too
  // small. Timed units are never split across rows.
  function layout(line: TimedLine | null): void {
    const glyphs: { text: string; x: number; w: number; row: number; y: number; time: number }[] = []
    handed = false
    curLineTime = line ? line.time : 0
    const lastU = line?.units[line.units.length - 1]
    curSpan = Math.max(4, (lastU && line ? lastU.time - line.time : 0) + 0.5)
    curx.clearRect(0, 0, cur.width, cur.height)
    bcurx.fillStyle = '#000'
    bcurx.fillRect(0, 0, bcur.width, bcur.height)
    if (!line || !cur.width) return
    const units = line.units.filter((u) => u.text)
    const W = cur.width
    const H = cur.height
    curx.font = `600 100px ${FONT}`
    const wOf = (u: { text: string }) => curx.measureText(u.text).width
    const total = units.reduce((s, u) => s + wOf(u), 0)
    const text = units.map((u) => u.text).join('')
    const segStarts = new Set<number>()
    let cp = 0
    for (const g of segment(text)) {
      segStarts.add(cp)
      cp += g.len
    }
    const breakable: boolean[] = []
    let pos = 0
    const blank = (u: { text: string }) => /^\s*$/.test(u.text)
    const spaces: number[] = [] // first non-blank unit after a space = phrase start
    units.forEach((u, i) => {
      const before = units[i - 1]
      const afterSpace = i > 0 && !!before && (blank(before) || /\s$/.test(before.text) || /^\s/.test(u.text))
      breakable[i] = i > 0 && !blank(u) && (segStarts.has(pos) || afterSpace)
      if (afterSpace && !blank(u)) spaces.push(i)
      pos += [...u.text].length
    })
    let cuts: number[] = []
    const cjk = /[぀-ヿ一-鿿]/.test(text)
    if (cjk && spaces.length >= 1 && spaces.length <= 2) cuts = spaces
    else {
      const k = total * ((H * 0.15) / 100) > W * 0.72 ? (total * ((H * 0.15) / 100) > W * 1.5 ? 3 : 2) : 1
      for (let r = 1; r < k; r++) {
        // nearest legal break to each ideal split
        const ideal = (total * r) / k
        let acc = 0
        let best = -1
        let bd = Infinity
        units.forEach((u, i) => {
          if (breakable[i] && Math.abs(acc - ideal) < bd && !cuts.includes(i)) {
            bd = Math.abs(acc - ideal)
            best = i
          }
          acc += wOf(u)
        })
        if (best > 0) cuts.push(best)
      }
      cuts.sort((a, b) => a - b)
    }
    const rows: (typeof units)[] = []
    let from = 0
    for (const c of [...cuts, units.length]) {
      const r = units.slice(from, c)
      if (r.some((u) => !blank(u))) rows.push(r)
      from = c
    }
    const rowText = (r: typeof units) => r.map((u) => u.text).join('')
    const widths = rows.map((r) => curx.measureText(rowText(r).trim()).width)
    const fs = Math.min((100 * W * 0.74) / Math.max(...widths, 1), (H * 0.4) / rows.length, H * 0.15)
    const lh = fs * 1.28
    const y0 = H * 0.58 - ((rows.length - 1) * lh) / 2
    curx.font = `600 ${fs}px ${FONT}`
    rows.forEach((r, ri) => {
      let x = W / 2 - (widths[ri]! * fs) / 100 / 2
      const lead = rowText(r).length - rowText(r).trimStart().length
      let skipped = 0
      r.forEach((u) => {
        let t = u.text
        if (skipped < lead) {
          const cut = Math.min(lead - skipped, t.length - t.trimStart().length)
          t = t.slice(cut)
          skipped += cut
        }
        const w = curx.measureText(t).width
        if (t) glyphs.push({ text: t, x, w, row: ri, y: y0 + ri * lh, time: u.time })
        x += w
      })
    })
    // The whole line goes into the texture NOW; the shader reveals each unit on its own clock.
    curx.textBaseline = 'middle'
    curx.fillStyle = '#fff'
    for (const g of glyphs) curx.fillText(g.text, g.x, g.y)
    // Birth map: every pixel takes the code of the nearest unit in its row, so
    // the blurred halo (which spills past the glyph) reveals with its own unit.
    rows.forEach((_, ri) => {
      const rg = glyphs.filter((g) => g.row === ri)
      const top = ri === 0 ? 0 : y0 + ri * lh - lh / 2
      const bot = ri === rows.length - 1 ? H : y0 + ri * lh + lh / 2
      rg.forEach((g, i) => {
        const x0 = i === 0 ? 0 : g.x
        const x1 = i === rg.length - 1 ? W : g.x + g.w
        const c = Math.max(0, Math.min(255, Math.round(((g.time - line.time) / curSpan) * 255)))
        bcurx.fillStyle = `rgb(${c},${c},${c})`
        bcurx.fillRect(Math.floor(x0), Math.floor(top), Math.ceil(x1 - x0) + 1, Math.ceil(bot - top) + 1)
      })
    })
    // Blur the map along the row only, so the reveal is one soft edge travelling
    // with the voice rather than a row of boxes switching on.
    tctx.globalCompositeOperation = 'source-over'
    tctx.filter = 'none'
    tctx.fillStyle = '#000'
    tctx.fillRect(0, 0, tmp.width, tmp.height)
    tctx.globalCompositeOperation = 'lighter'
    tctx.globalAlpha = 1 / 11
    for (let i = -5; i <= 5; i++) tctx.drawImage(bcur, i * fs * 0.07, 0)
    tctx.globalAlpha = 1
    tctx.globalCompositeOperation = 'source-over'
    bcurx.drawImage(tmp, 0, 0)
  }

  function launch(line: boolean): void {
    const e = energy
    const now = wall()
    waves.push(
      line
        ? { t0: now, R: 0.92 + 0.26 * e, seed: (seedN++ * 0.618) % 10, Tu: TU, Tb: TB + e * 0.6, foam: 0.5 + 0.8 * e, line: true }
        : { t0: now + 1.8, R: 0.26 + Math.random() * 0.13, seed: 20 + ((seedN++ * 0.618) % 10), Tu: 1.0, Tb: 2.2, foam: 0.3 + 0.2 * e, line: false },
    )
    if (line) nextWavelet = Math.max(nextWavelet, now + TU + 2.2) // don't crowd the line wave
  }

  // cur → prev: the current line becomes the leaving line for the wave to take
  function handOver(): void {
    prevx.clearRect(0, 0, prev.width, prev.height)
    prevx.drawImage(cur, 0, 0)
    bprevx.drawImage(bcur, 0, 0)
    prevLineTime = curLineTime
    prevSpan = curSpan
    curx.clearRect(0, 0, cur.width, cur.height)
    handed = true
    dirty = true
    prevGoneAt = wall() + TU + HOLD
    holdNewUntil = wall() + ARRIVE_END + 0.12 // don't write the new line on top of one still being wiped
  }

  return {
    setLines(next: TimedLine[]): void {
      lines = next
      lineWaves = scheduleWaves(lines)
      curIdx = -2
      lastContent = -1
      prevx.clearRect(0, 0, prev.width, prev.height)
      layout(null)
      dirty = true
    },

    /** Idle: only waves. That's the screensaver. */
    clear(): void {
      this.setLines([])
    },

    setAccent(rgb: [number, number, number] | null): void {
      if (!rgb) {
        accent = DEFAULT_ACCENT
        return
      }
      let [r, g, b] = rgb.map((c) => c / 255) as [number, number, number]
      const mx = Math.max(r, g, b, 1e-3)
      if (mx < 0.75) {
        // the glow needs a bright stop even from a dark color
        const k = 0.75 / mx
        r *= k
        g *= k
        b *= k
      }
      accent = [Math.min(1, r), Math.min(1, g), Math.min(1, b)]
    },

    /** Audio loudness 0..1: how far the next wave reaches, how thick its filaments are. */
    energy(value: number): void {
      energyTarget = Math.min(1, value * 3.2)
      energyAt = wall()
    },

    onset(velocity: number): void {
      beat = Math.max(beat, velocity)
    },

    /** @param t the content's local time in seconds */
    frame(now: number, t: number): void {
      const dt = cap(now)
      if (dt === null) return
      const nowS = now / 1000
      fit()
      const target = wall() - energyAt < 0.3 ? energyTarget : 0.45
      energy += (target - energy) * Math.min(1, dt * 0.9)

      // content clock → which line, and did we cross a wave launch?
      let idx = -1
      for (let i = 0; i < lines.length; i++) {
        if (lines[i]!.time <= t) idx = i
        else break
      }
      const jumped = lastContent < 0 || t < lastContent - 0.05 || t > lastContent + 1.5 // seek / new content / first frame
      if (!jumped) {
        for (const at of lineWaves) {
          if (lastContent < at && t >= at) {
            handOver()
            launch(true)
          }
        }
      }
      if (idx !== curIdx) {
        const waveCame = !jumped && handed && prevGoneAt > nowS // the wave already took the old line
        if (!waveCame) {
          prevx.clearRect(0, 0, prev.width, prev.height)
          prevGoneAt = 0
        }
        curIdx = idx
        layout(lines[idx] ?? null)
        dirty = true
      }
      lastContent = t
      if (prevGoneAt && nowS >= prevGoneAt) {
        prevx.clearRect(0, 0, prev.width, prev.height)
        prevGoneAt = 0
        dirty = true
      }
      if (dirty) upload()

      // breathing waves between line waves; retire the long dead
      if (nowS >= nextWavelet) {
        launch(false)
        nextWavelet = nowS + 2.9 + Math.random() * 1.3
      }
      waves = waves.filter((w) => nowS < w.t0 + w.Tu + w.Tb + 14).slice(-NW)
      beat *= Math.exp(-dt * 6)

      // wave ages are computed here in doubles; uT only drives the slow noise drift
      const A = new Float32Array(NW * 4)
      const B = new Float32Array(NW * 4)
      waves.forEach((w, i) => {
        A.set([nowS - w.t0, w.R, w.seed, w.Tu], i * 4)
        B.set([w.Tb, w.foam, w.line ? 1 : 0, 0], i * 4)
      })
      gl.uniform4fv(pass.uniform('uWA'), A)
      gl.uniform4fv(pass.uniform('uWB'), B)
      gl.uniform2f(pass.uniform('uRes'), cv.width, cv.height)
      gl.uniform1f(pass.uniform('uT'), nowS - t00)
      gl.uniform1f(pass.uniform('uBeat'), beat)
      gl.uniform1i(pass.uniform('uTex'), 0)
      gl.uniform1i(pass.uniform('uBirth'), 1)
      // a line handed to the wave early still belongs to the OLD index until the content clock moves on
      const curClock = handed || nowS < holdNewUntil ? -9 : t - curLineTime
      gl.uniform2f(pass.uniform('uClock'), curClock, t - prevLineTime)
      gl.uniform2f(pass.uniform('uSpan'), curSpan, prevSpan)
      gl.uniform3f(pass.uniform('uAccent'), accent[0], accent[1], accent[2])
      pass.draw()
    },

    dispose(): void {
      gl.deleteTexture(tex)
      gl.deleteTexture(texB)
      pass.dispose()
      cv.remove()
    },
  }
}
