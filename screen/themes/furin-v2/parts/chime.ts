// The chime's DOM: the bell drawn in ink (SVG), the spark for a clapper, and
// the strip as an ivory card, nested as 3D-transformed links the physics
// swings. Rings are ink marks off the struck rim; a strong gust is drawn
// passing behind it.
import type { ChimePhysics, StrikeEvent } from '@screen/primitives/chime'
import { sparkPath } from '@screen/primitives/spark'
import { setLang } from '@screen/primitives/text'
import { brush, cubic, pressure, type Pt } from './brush'
import { BELL, SHINE, cord, innerRim, outline, painting } from './glass'
import { PER_CHAR, sizeFor, type PaperContent } from './paper'

const DEPTH_VIEW_GAIN = 1.7 // render-only exaggeration of the depth tilt
const PAPER_PITCH_KEEP = 0.15 // how much of the chain's depth pitch the strip keeps
/** The old writing fades this long before the new is written. */
const CLEAR_MS = 320
/** A gust strong enough to be drawn, and how seldom. */
const GUST_DRAWN = 1.05
const GUST_GAP_MS = 7000

const P = (x: number, y: number): Pt => ({ x, y })

/** Sound marks: three short strokes off the rim, the way a comic draws a ring. */
function marks(side: 1 | -1): string {
  return [10, 17, 24]
    .map((r, i) => {
      const a0 = -0.75 + i * 0.06
      const a1 = 0.55 - i * 0.05
      const pts = Array.from({ length: 9 }, (_, k) => {
        const a = a0 + ((a1 - a0) * k) / 8
        return P(side * Math.cos(a) * r, Math.sin(a) * r)
      })
      return `<path d="${brush(pts, (t) => (2.4 - i * 0.45) * pressure(t))}"/>`
    })
    .join('')
}

/** A breeze, drawn: one long stroke that curls at its end. */
const GUST = brush(
  [...cubic(P(0, 18), P(40, 2), P(80, 30), P(120, 14), 18), ...cubic(P(120, 14), P(138, 7), P(146, 22), P(134, 26), 8).slice(1), ...cubic(P(134, 26), P(124, 29), P(122, 18), P(130, 16), 6).slice(1)],
  (t) => 2.6 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05)), 0.7),
)

const MARKUP = `
  <div class="fv-anchor">
    <div class="fv-link fv-l0">
      <svg class="fv-bell" width="160" height="240" viewBox="-80 -10 160 240">
        <g class="fv-halo">
          <path class="fv-halo-cord" d="${cord()}"/>
          <path d="${BELL}"/>
        </g>
        <path class="fv-ink" d="${cord()}"/>
        <circle class="fv-ink" cx="0" cy="85" r="2.9"/>
        <g transform="translate(4 3)">
          <path class="fv-glass" d="${BELL}"/>
          <ellipse class="fv-mouth" cx="0" cy="177.5" rx="30" ry="4.4"/>
          <g class="fv-paint">${painting()
            .map((d) => `<path d="${d}"/>`)
            .join('')}</g>
          <path class="fv-shine" d="${SHINE}"/>
        </g>
        <path class="fv-ink fv-rim-back" d="${innerRim()}"/>
        <path class="fv-ink" d="${outline()}"/>
      </svg>
      <div class="fv-mark fv-mark-l"></div>
      <div class="fv-mark fv-mark-r"></div>
      <div class="fv-link fv-l1">
        <div class="fv-thread"></div>
        <svg class="fv-spark" viewBox="-1.1 -1.1 2.2 2.2"><path d="${sparkPath()}"/></svg>
        <div class="fv-link fv-l2">
          <div class="fv-tie"></div>
          <div class="fv-tz">
            <div class="fv-card is-blank">
              <div class="fv-hole"></div>
              <div class="fv-rail"><i></i></div>
              <div class="fv-text"><span></span></div>
              <div class="fv-seal"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>`

function span(cls: string, content: string): HTMLSpanElement {
  const s = document.createElement('span')
  s.className = cls
  s.textContent = content
  return s
}

/** Characters, each its own span, to be written in one by one. */
function letters(text: string): HTMLSpanElement[] {
  return [...text].map((c) => span('fv-c', c))
}

/** Up to two digits stand upright in the column (縦中横); longer numbers lie along it. */
function upright(cls: string, digits: string): HTMLSpanElement {
  const s = span(cls, digits)
  if ([...digits].length <= 2) s.classList.add('tcy')
  return s
}

function q<T extends Element>(root: Element, selector: string): T {
  const el = root.querySelector<T>(selector)
  if (!el) throw new Error(`furin-v2 markup is missing ${selector}`)
  return el
}

export function buildChime(root: HTMLElement) {
  root.innerHTML = MARKUP
  const l0 = q<HTMLElement>(root, '.fv-l0')
  const l1 = q<HTMLElement>(root, '.fv-l1')
  const l2 = q<HTMLElement>(root, '.fv-l2')
  const paint = q<SVGGElement>(root, '.fv-paint')
  const shine = q<SVGPathElement>(root, '.fv-shine')
  const mouth = q<SVGEllipseElement>(root, '.fv-mouth')
  const spark = q<SVGSVGElement>(root, '.fv-spark')
  const card = q<HTMLElement>(root, '.fv-card')
  const text = q<HTMLElement>(root, '.fv-text span')
  const rail = q<HTMLElement>(root, '.fv-rail i')
  const markL = q<HTMLElement>(root, '.fv-mark-l')
  const markR = q<HTMLElement>(root, '.fv-mark-r')

  let spin = 0
  /** What is being written: its characters, when the writing began, how many are down. */
  let writing: { chars: HTMLElement[]; from: number; shown: number } | null = null
  let pending: { content: PaperContent; at: number } | null = null
  let lastGust = 0

  function put(content: PaperContent, now: number): void {
    text.replaceChildren()
    text.classList.remove('is-clearing')
    card.dataset.kind = content.kind
    card.classList.toggle('is-blank', content.kind === 'blank')
    setLang(text, content.kind === 'blank' ? undefined : content.lang)
    let size = 17
    let chars: HTMLElement[] = []
    switch (content.kind) {
      case 'text': {
        chars = letters(content.text)
        if (content.reading) {
          const ruby = document.createElement('ruby')
          const rt = document.createElement('rt')
          rt.textContent = content.reading
          ruby.append(...chars, rt)
          text.append(ruby)
        } else text.append(...chars)
        size = sizeFor(chars.length)
        break
      }
      case 'value': {
        if (content.label) text.append(span('fv-label', content.label))
        text.append(upright('fv-num', content.number))
        if (content.unit) text.append(span('fv-unit', content.unit))
        if (content.delta) text.append(span('fv-delta', content.delta))
        const n = [...content.number].length + (content.label ? [...content.label].length * 0.6 : 0)
        size = n > 10 ? 14 : 16
        break
      }
      case 'progress': {
        if (content.label) text.append(span('fv-label', content.label))
        text.append(upright('fv-num', String(Math.round(content.ratio * 100))), span('fv-unit', '%'))
        rail.style.setProperty('--p', content.ratio.toFixed(4))
        break
      }
      case 'image': {
        const img = document.createElement('img')
        img.className = 'fv-photo'
        img.src = content.src
        img.alt = content.alt ?? ''
        text.append(img)
        if (content.alt) text.append(span('fv-caption', content.alt))
        size = 14
        break
      }
    }
    text.style.fontSize = `${size}px`
    // A line is written in a character at a time; anything else arrives whole.
    writing = chars.length ? { chars, from: now, shown: 0 } : null
    card.classList.toggle('is-writing', !!writing)
    if (!writing) text.classList.add('is-whole')
    else text.classList.remove('is-whole')
  }

  function ring(mark: HTMLElement, side: 1 | -1, intensity: number, echo: boolean): void {
    const base = root.getBoundingClientRect()
    const r = mark.getBoundingClientRect()
    const el = document.createElement('div')
    el.className = 'fv-ring' + (echo ? ' is-echo' : '')
    el.style.left = `${r.left - base.left}px`
    el.style.top = `${r.top - base.top}px`
    el.style.setProperty('--ri', intensity.toFixed(2))
    el.innerHTML = `<svg viewBox="-30 -30 60 60">${marks(side)}</svg>`
    el.addEventListener('animationend', () => el.remove())
    root.appendChild(el)
  }

  return {
    /** The sound, made visible: ink marks off the struck rim, and the spark jumps. */
    strike({ intensity, side }: StrikeEvent): void {
      ring(side > 0 ? markR : markL, side, intensity, false)
      if (intensity > 0.62) setTimeout(() => root.isConnected && ring(side > 0 ? markR : markL, side, intensity * 0.7, true), 140)
      spin += side * 40 * intensity
      spark.classList.remove('is-struck')
      void spark.getBoundingClientRect()
      spark.classList.add('is-struck')
    },

    /** New writing: the old fades, then the new is written in under the turning seal. */
    write(content: PaperContent, now: number): void {
      const shown = !card.classList.contains('is-blank')
      if (!shown) return put(content, now)
      text.classList.add('is-clearing')
      card.classList.add('is-writing')
      writing = null
      pending = { content, at: now + CLEAR_MS }
    },

    /** The same status with new figures: rewritten where it hangs. */
    rewrite(content: PaperContent, now: number): void {
      pending = null
      put(content, now)
    },

    /** The seal warms for a moment: something worth a glance was written. */
    glow(): void {
      card.classList.remove('is-hot')
      void card.offsetWidth
      card.classList.add('is-hot')
    },

    /** A strong gust is drawn passing behind the chime. */
    gust(windMag: number, now: number): void {
      if (Math.abs(windMag) < GUST_DRAWN || now - lastGust < GUST_GAP_MS) return
      lastGust = now
      const el = document.createElement('div')
      el.className = 'fv-gust'
      el.style.top = `${30 + Math.random() * 45}%`
      // It blows the way the wind does: a leftward gust is drawn mirrored and runs the other way.
      if (windMag < 0) el.classList.add('is-west')
      el.innerHTML = `<svg viewBox="-4 -4 156 40"><path d="${GUST}"/></svg>`
      el.addEventListener('animationend', () => el.remove())
      root.prepend(el)
    },

    render(physics: ChimePhysics, now: number, dt: number, skewDeg: number): void {
      // The writing: the old clears, then the new goes down a character at a time.
      if (pending && now >= pending.at) {
        put(pending.content, now)
        pending = null
      }
      if (writing) {
        const k = Math.min(writing.chars.length, Math.floor((now - writing.from) / 1000 / PER_CHAR) + 1)
        while (writing.shown < k) writing.chars[writing.shown++]!.classList.add('is-on')
        if (writing.shown >= writing.chars.length) {
          writing = null
          card.classList.remove('is-writing')
        }
      } else if (!pending) card.classList.remove('is-writing')

      const { bell: B, clap: C, paper: T, paperPsi, bellPsi } = physics.pose
      const rad = (v: number) => `${v.toFixed(4)}rad`
      const zr = (v: number) => `${(v * DEPTH_VIEW_GAIN).toFixed(4)}rad`
      l0.style.transform = `rotateZ(${rad(B.x.th)}) rotateX(${zr(B.z.th)}) rotateY(${rad(bellPsi)})`
      l1.style.transform = `rotateZ(${rad(C.x.th - B.x.th)}) rotateX(${zr(C.z.th - B.z.th)})`
      l2.style.transform = `rotateZ(${rad(T.x.th - C.x.th)}) rotateX(${zr(T.z.th - C.z.th)})`
      // The spark turns with the clapper's swing, and with each strike.
      spin += (C.x.w - B.x.w) * dt * 50
      spark.style.transform = `rotate(${(spin % 360).toFixed(2)}deg)`
      // Cancel most of the chain's depth pitch so the card rides upright instead of keystoning.
      const pitch = -T.z.th * DEPTH_VIEW_GAIN * (1 - PAPER_PITCH_KEEP)
      card.style.transform = `rotateX(${pitch.toFixed(4)}rad) rotateY(${(paperPsi * 57.2958).toFixed(2)}deg) skewX(${skewDeg.toFixed(2)}deg)`
      // Twisting, the painting rides round with the glass and the light stays put.
      const dx = Math.sin(bellPsi) * 46
      paint.setAttribute('transform', `translate(${(dx * 0.8).toFixed(2)} 0)`)
      shine.setAttribute('transform', `translate(${(-dx * 0.3).toFixed(2)} 0)`)
      // Swinging toward the viewer opens the mouth; away flattens it to a sliver.
      const open = Math.max(0.5, Math.min(1.9, 1 + B.z.th * DEPTH_VIEW_GAIN * 4.5))
      mouth.setAttribute('transform', `translate(0 177.5) scale(1 ${open.toFixed(3)}) translate(0 -177.5)`)
    },
  }
}
