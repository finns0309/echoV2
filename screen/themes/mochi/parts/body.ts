// The mochi drawn: a soft dome of rice cake with a flat underside, a sheen on
// top, two dot eyes, blushing cheeks and a small mouth. Squash widens it as it
// lowers; a hop lifts it off its shadow. Only what changed is written each frame.
// Its flavour (the season's wagashi) sets its colours and a garnish, drawn at rest
// size and scaled with the body.
import type { Flavor, Garnish } from './flavor'
import type { Eyes, Mouth, Pose } from './motion'

const NS = 'http://www.w3.org/2000/svg'
const W = 50 // half-width at rest, in the drawing's units
const H = 62 // height at rest

function node<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string>): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v)
  return e
}

const f = (n: number) => n.toFixed(2)

/** The body's outline, its base centred on 0,0. */
export function outline(w: number, h: number): string {
  return `M${f(-w)} 0C${f(-w * 1.04)} ${f(-h * 0.62)} ${f(-w * 0.6)} ${f(-h)} 0 ${f(-h)}C${f(w * 0.6)} ${f(-h)} ${f(w * 1.04)} ${f(-h * 0.62)} ${f(w)} 0Q0 ${f(h * 0.07)} ${f(-w)} 0Z`
}

function eye(kind: Eyes, cx: number, cy: number): { d: string; filled: boolean } {
  const a = kind === 'wow' ? 4.2 : 3.2
  const b = kind === 'wow' ? 5.4 : 4.2
  switch (kind) {
    case 'open':
    case 'wow':
      return { d: `M${f(cx - a)} ${f(cy)}A${a} ${b} 0 1 0 ${f(cx + a)} ${f(cy)}A${a} ${b} 0 1 0 ${f(cx - a)} ${f(cy)}Z`, filled: true }
    case 'blink':
      return { d: `M${f(cx - 3.4)} ${f(cy)}Q${f(cx)} ${f(cy + 1)} ${f(cx + 3.4)} ${f(cy)}`, filled: false }
    case 'happy':
      return { d: `M${f(cx - 3.6)} ${f(cy + 1.6)}Q${f(cx)} ${f(cy - 3.4)} ${f(cx + 3.6)} ${f(cy + 1.6)}`, filled: false }
    case 'sleep':
      return { d: `M${f(cx - 3.6)} ${f(cy - 0.6)}Q${f(cx)} ${f(cy + 2.8)} ${f(cx + 3.6)} ${f(cy - 0.6)}`, filled: false }
  }
}

function mouth(kind: Mouth, mx: number, my: number): { d: string; filled: boolean } {
  switch (kind) {
    case 'smile':
      return { d: `M${f(mx - 3.8)} ${f(my)}Q${f(mx)} ${f(my + 3.4)} ${f(mx + 3.8)} ${f(my)}`, filled: false }
    case 'o':
      return { d: `M${f(mx - 2.4)} ${f(my + 1)}A2.4 3 0 1 0 ${f(mx + 2.4)} ${f(my + 1)}A2.4 3 0 1 0 ${f(mx - 2.4)} ${f(my + 1)}Z`, filled: true }
    case 'flat':
      return { d: `M${f(mx - 2.6)} ${f(my + 1)}L${f(mx + 2.6)} ${f(my + 1)}`, filled: false }
  }
}

/** Specks of dusting (kinako, uguisu), as fractions of the half-width and height. */
const SPECKS: [number, number, number][] = [
  [-0.55, 0.62, 1.3], [-0.2, 0.86, 1.1], [0.18, 0.9, 1.4], [0.52, 0.66, 1.1], [-0.72, 0.38, 1], [0.7, 0.36, 1.2],
  [-0.4, 0.74, 0.9], [0.36, 0.78, 1], [0.02, 0.97, 0.9], [-0.84, 0.18, 1.1], [0.86, 0.2, 0.9], [0.1, 0.72, 0.8],
]

/** A garnish at rest size: what goes behind the body, and what goes on it. */
function garnish(kind: Garnish): { back: string; front: string } {
  const w = W
  const h = H
  switch (kind) {
    case 'leaf': // a salted cherry leaf, wrapped round its lower half
      return {
        back: '',
        front: `<path d="M${-w * 1.02} ${-h * 0.02}C${-w * 0.5} ${-h * 0.34} ${w * 0.4} ${-h * 0.38} ${w * 1.02} ${-h * 0.18}C${w * 0.5} ${-h * 0.1} ${-w * 0.2} ${-h * 0.02} ${-w * 1.02} ${-h * 0.02}Z" fill="#7da25c"/><path d="M${-w * 0.8} ${-h * 0.06}C${-w * 0.2} ${-h * 0.2} ${w * 0.4} ${-h * 0.24} ${w * 0.92} ${-h * 0.18}" stroke="#5f8243" stroke-width="1" fill="none"/>`,
      }
    case 'oak': // an oak leaf folded round it, showing either side
      return {
        back: `<path d="M${-w * 1.16} 1C${-w * 1.26} ${-h * 0.6} ${-w * 0.6} ${-h * 1.08} 0 ${-h * 1.1}C${w * 0.6} ${-h * 1.08} ${w * 1.26} ${-h * 0.6} ${w * 1.16} 1Z" fill="#6f8f4e"/><path d="M0 ${-h * 1.06}L0 0" stroke="#58733c" stroke-width="1.2"/>`,
        front: '',
      }
    case 'dust':
      return { back: '', front: SPECKS.map(([u, v, r]) => `<circle cx="${u * w}" cy="${-v * h}" r="${r}" class="mc-speck"/>`).join('') }
    case 'chestnut': // a piece of chestnut on top
      return {
        back: '',
        front: `<ellipse cx="${w * 0.08}" cy="${-h * 1.0}" rx="${w * 0.24}" ry="${h * 0.13}" fill="#e3b04b"/><path d="M${-w * 0.14} ${-h * 1.04}Q${w * 0.08} ${-h * 1.18} ${w * 0.3} ${-h * 1.04}" fill="#8a5a2b"/>`,
      }
    case 'berry': // a strawberry peeking out of the top
      return {
        back: '',
        front: `<path d="M${-w * 0.24} ${-h * 0.95}Q0 ${-h * 1.3} ${w * 0.24} ${-h * 0.95}Q0 ${-h * 1.02} ${-w * 0.24} ${-h * 0.95}Z" fill="#e8505b"/><circle cx="${-w * 0.08}" cy="${-h * 1.06}" r=".8" fill="#ffd6a0"/><circle cx="${w * 0.08}" cy="${-h * 1.1}" r=".8" fill="#ffd6a0"/><circle cx="0" cy="${-h * 1.01}" r=".8" fill="#ffd6a0"/>`,
      }
    case 'none':
      return { back: '', front: '' }
  }
}

export function createBody(host: HTMLElement) {
  const svg = node('svg', { class: 'mc-body', viewBox: '-100 -150 200 160', 'aria-hidden': 'true' })
  const defs = node('defs', {})
  const fill = node('radialGradient', { id: 'mc-fill', cx: '42%', cy: '28%', r: '80%' })
  const stops = [node('stop', { offset: '0' }), node('stop', { offset: '.7' }), node('stop', { offset: '1' })]
  fill.append(...stops)
  defs.append(fill)
  const shadow = node('ellipse', { class: 'mc-shadow', cx: '0', cy: '3', rx: '46', ry: '6' })
  const lift = node('g', {})
  const lean = node('g', {})
  const back = node('g', {})
  const skin = node('path', { class: 'mc-skin', fill: 'url(#mc-fill)' })
  const front = node('g', {})
  const sheen = node('ellipse', { class: 'mc-sheen' })
  const face = node('g', {})
  const cheekL = node('ellipse', { class: 'mc-cheek', rx: '6.5', ry: '3.4' })
  const cheekR = node('ellipse', { class: 'mc-cheek', rx: '6.5', ry: '3.4' })
  const eyeL = node('path', { class: 'mc-eye' })
  const eyeR = node('path', { class: 'mc-eye' })
  const lips = node('path', { class: 'mc-mouth' })
  face.append(cheekL, cheekR, eyeL, eyeR, lips)
  lean.append(back, skin, sheen, front, face)
  lift.append(lean)
  svg.append(defs, shadow, lift)
  host.append(svg)

  const set = (e: Element, attr: string, v: string) => {
    if (e.getAttribute(attr) !== v) e.setAttribute(attr, v)
  }
  const shape = (e: SVGPathElement, s: { d: string; filled: boolean }) => {
    set(e, 'd', s.d)
    e.classList.toggle('is-line', !s.filled)
  }

  return {
    svg,
    /** Dress it as today's wagashi. */
    setFlavor(f: Flavor): void {
      f.fill.forEach((c, i) => stops[i]!.setAttribute('stop-color', c))
      svg.style.setProperty('--mc-skin-edge', f.stroke)
      svg.style.setProperty('--mc-eyes', f.eyes)
      svg.style.setProperty('--mc-cheeks', f.cheeks)
      svg.classList.toggle('is-clear', !!f.clear)
      const g = garnish(f.garnish)
      back.innerHTML = g.back
      front.innerHTML = g.front
    },
    draw(p: Pose): void {
      const w = W * (1 + p.squash)
      const h = H * (1 - p.squash)
      set(skin, 'd', outline(w, h))
      set(sheen, 'cx', f(-w * 0.34))
      set(sheen, 'cy', f(-h * 0.74))
      set(sheen, 'rx', f(w * 0.26))
      set(sheen, 'ry', f(h * 0.1))
      set(lift, 'transform', `translate(0 ${f(-p.lift)})`)
      set(lean, 'transform', `skewX(${f(-p.lean)})`)
      // The garnish is drawn at rest size; it squashes with the body.
      const g = `scale(${f(w / W)} ${f(h / H)})`
      set(back, 'transform', g)
      set(front, 'transform', g)
      // Its shadow shrinks and fades as it rises.
      const up = Math.min(1, p.lift / 40)
      set(shadow, 'rx', f(46 * (1 + p.squash) * (1 - up * 0.35)))
      set(shadow, 'opacity', f(1 - up * 0.5))
      // The face turns toward where it looks.
      const fx = p.look * w * 0.2
      const ey = -h * 0.44
      shape(eyeL, eye(p.eyes, fx - w * 0.34, ey))
      shape(eyeR, eye(p.eyes, fx + w * 0.34, ey))
      set(cheekL, 'cx', f(fx - w * 0.54))
      set(cheekR, 'cx', f(fx + w * 0.54))
      set(cheekL, 'cy', f(ey + h * 0.13))
      set(cheekR, 'cy', f(ey + h * 0.13))
      shape(lips, mouth(p.mouth, fx, -h * 0.29))
    },
  }
}
