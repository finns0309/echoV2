// The mochi drawn: a soft dome of rice cake with a flat underside, a sheen on
// top, two dot eyes, blushing cheeks and a small mouth. Squash widens it as it
// lowers; a hop lifts it off its shadow. Only what changed is written each frame.
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

export function createBody(host: HTMLElement) {
  const svg = node('svg', { class: 'mc-body', viewBox: '-100 -150 200 160', 'aria-hidden': 'true' })
  const defs = node('defs', {})
  const fill = node('radialGradient', { id: 'mc-fill', cx: '42%', cy: '28%', r: '80%' })
  fill.append(node('stop', { offset: '0', 'stop-color': '#fffefb' }), node('stop', { offset: '.7', 'stop-color': '#fbf5ec' }), node('stop', { offset: '1', 'stop-color': '#efe4d4' }))
  defs.append(fill)
  const shadow = node('ellipse', { class: 'mc-shadow', cx: '0', cy: '3', rx: '46', ry: '6' })
  const lift = node('g', {})
  const lean = node('g', {})
  const skin = node('path', { class: 'mc-skin', fill: 'url(#mc-fill)' })
  const sheen = node('ellipse', { class: 'mc-sheen' })
  const face = node('g', {})
  const cheekL = node('ellipse', { class: 'mc-cheek', rx: '6.5', ry: '3.4' })
  const cheekR = node('ellipse', { class: 'mc-cheek', rx: '6.5', ry: '3.4' })
  const eyeL = node('path', { class: 'mc-eye' })
  const eyeR = node('path', { class: 'mc-eye' })
  const lips = node('path', { class: 'mc-mouth' })
  face.append(cheekL, cheekR, eyeL, eyeR, lips)
  lean.append(skin, sheen, face)
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
