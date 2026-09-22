// The chime's DOM: a glass bell (SVG), the clapper bead, and the paper strip,
// nested as 3D-transformed links. Ported from echo's furin.js.
import type { ChimePhysics, StrikeEvent } from './physics'

const DEPTH_VIEW_GAIN = 1.7 // render-only exaggeration of the depth tilt
const PAPER_PITCH_KEEP = 0.15 // how much of the chain's depth pitch the paper keeps

const BELL_PATH =
  'M -34 178 C -52 168 -57 150 -55 128 C -52 100 -28 84 0 84 C 28 84 52 100 56 128 C 58 150 52 168 34 178 C 25 182 13 179.5 0 180.5 C -13 181.5 -25 182 -34 178 Z'

const MARKUP = `
  <div class="fr-anchor">
    <div class="fr-link fr-l0">
      <svg class="fr-bell-svg" width="160" height="240" viewBox="-80 -10 160 240">
        <defs>
          <radialGradient id="fr-glass" cx="0.46" cy="0.42" r="0.72">
            <stop offset="0" style="stop-color: color-mix(in srgb, var(--furin-accent) 14%, #ffffff)" stop-opacity="0.06"/>
            <stop offset="0.55" style="stop-color: color-mix(in srgb, var(--furin-accent) 38%, #ffffff)" stop-opacity="0.10"/>
            <stop offset="0.82" style="stop-color: color-mix(in srgb, var(--furin-accent) 62%, #ffffff)" stop-opacity="0.24"/>
            <stop offset="1" style="stop-color: color-mix(in srgb, var(--furin-accent) 76%, #39415a)" stop-opacity="0.44"/>
          </radialGradient>
          <radialGradient id="fr-hl" cx="0.4" cy="0.35" r="0.6">
            <stop offset="0" stop-color="#ffffff" stop-opacity="0.9"/>
            <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
          </radialGradient>
          <clipPath id="fr-bell-clip"><path d="${BELL_PATH}"/></clipPath>
        </defs>
        <line class="fr-cord" x1="0" y1="-10" x2="0" y2="84"/>
        <circle class="fr-knot" cx="0" cy="83" r="2.4"/>
        <path class="fr-glass" d="${BELL_PATH}" fill="url(#fr-glass)"/>
        <g clip-path="url(#fr-bell-clip)" class="fr-deco">
          <path class="fr-d1" d="M -38 166 q 18 -24 36 -32"/>
          <path class="fr-d2" d="M -25 172 q 15 -15 30 -19"/>
          <path class="fr-d3" d="M 6 170 q 11 -8 24 -10"/>
        </g>
        <g class="fr-refl">
          <ellipse class="fr-bloom" cx="-24" cy="109" rx="8.5" ry="16" transform="rotate(-24 -24 109)" fill="url(#fr-hl)"/>
          <ellipse class="fr-speck" cx="-12" cy="97" rx="3" ry="5" transform="rotate(-22 -12 97)"/>
          <path class="fr-crescent" d="M 45 114 q 10 17 4 38" fill="none"/>
          <path class="fr-bowlight" d="M -24 170 q 24 10 48 0" fill="none"/>
        </g>
        <ellipse class="fr-mouth-shadow" cx="0" cy="178" rx="29" ry="3.5"/>
        <path class="fr-rim" d="M -34 178 C -25 182 -13 179.5 0 180.5 C 13 181.5 25 182 34 178" fill="none"/>
      </svg>
      <div class="fr-mouth-mark fr-mouth-l"></div>
      <div class="fr-mouth-mark fr-mouth-r"></div>
      <div class="fr-link fr-l1">
        <div class="fr-thread"></div>
        <div class="fr-bead"></div>
        <div class="fr-link fr-l2">
          <div class="tz-thread"></div>
          <div class="fr-tz">
            <div class="tz-paper blank">
              <div class="tz-hole"></div>
              <div class="tz-text"><span></span></div>
              <div class="tz-seal"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>`

function q<T extends Element>(root: Element, selector: string): T {
  const el = root.querySelector<T>(selector)
  if (!el) throw new Error(`furin markup is missing ${selector}`)
  return el
}

export function buildChime(root: HTMLElement) {
  root.innerHTML = MARKUP
  const l0 = q<HTMLElement>(root, '.fr-l0')
  const l1 = q<HTMLElement>(root, '.fr-l1')
  const l2 = q<HTMLElement>(root, '.fr-l2')
  const paper = q<HTMLElement>(root, '.tz-paper')
  const text = q<HTMLElement>(root, '.tz-text span')
  const bellSvg = q<SVGSVGElement>(root, '.fr-bell-svg')
  const deco = q<SVGGElement>(root, '.fr-deco')
  const refl = q<SVGGElement>(root, '.fr-refl')
  const mouthShadow = q<SVGEllipseElement>(root, '.fr-mouth-shadow')
  const mouthL = q<HTMLElement>(root, '.fr-mouth-l')
  const mouthR = q<HTMLElement>(root, '.fr-mouth-r')

  function spawnRing(rect: DOMRect, intensity: number, echo: boolean, centroid: number): void {
    const el = document.createElement('div')
    el.className = 'fr-ring' + (echo ? ' echo' : '')
    const base = root.getBoundingClientRect()
    el.style.left = `${rect.left + rect.width / 2 - base.left}px`
    el.style.top = `${rect.top + rect.height / 2 - base.top}px`
    el.style.setProperty('--ri', intensity.toFixed(2))
    // Bright (high-centroid) hits ring whiter; dark ones keep the glass color.
    el.style.setProperty('--ring-accent-mix', `${Math.round(20 + (1 - centroid) * 45)}%`)
    el.addEventListener('animationend', () => el.remove())
    root.appendChild(el)
  }

  return {
    /** The sound, made visible: a flash on the glass and a ring from the struck rim. */
    strike({ intensity, side, centroid }: StrikeEvent): void {
      bellSvg.classList.add('striking')
      setTimeout(() => bellSvg.classList.remove('striking'), 90)
      const rect = (side > 0 ? mouthR : mouthL).getBoundingClientRect()
      spawnRing(rect, intensity, false, centroid)
      if (intensity > 0.62) setTimeout(() => root.isConnected && spawnRing(rect, intensity * 0.7, true, centroid), 130)
    },

    /** Write the strip. Vertical text; a reading becomes ruby beside it. */
    write(content: string, reading?: string): void {
      text.replaceChildren()
      if (content && reading) {
        const ruby = document.createElement('ruby')
        const rt = document.createElement('rt')
        ruby.append(content)
        rt.textContent = reading
        ruby.append(rt)
        text.append(ruby)
      } else {
        text.textContent = content
      }
      const n = [...content].length
      text.style.fontSize = `${n > 22 ? 12 : n > 18 ? 13 : n > 14 ? 14 : n > 11 ? 15 : n > 8 ? 16 : 17}px`
      paper.classList.toggle('blank', !content)
    },

    render(physics: ChimePhysics, flipDeg: number, skewDeg: number): void {
      const { bell: B, clap: C, paper: T, paperPsi, bellPsi } = physics.pose
      const rad = (v: number) => `${v.toFixed(4)}rad`
      const zr = (v: number) => `${(v * DEPTH_VIEW_GAIN).toFixed(4)}rad`
      l0.style.transform = `rotateZ(${rad(B.x.th)}) rotateX(${zr(B.z.th)}) rotateY(${rad(bellPsi)})`
      l1.style.transform = `rotateZ(${rad(C.x.th - B.x.th)}) rotateX(${zr(C.z.th - B.z.th)})`
      l2.style.transform = `rotateZ(${rad(T.x.th - C.x.th)}) rotateX(${zr(T.z.th - C.z.th)})`
      // Cancel most of the chain's depth pitch so the strip rides upright instead of keystoning.
      const pitch = -T.z.th * DEPTH_VIEW_GAIN * (1 - PAPER_PITCH_KEEP)
      paper.style.transform = `rotateX(${pitch.toFixed(4)}rad) rotateY(${(flipDeg + paperPsi * 57.2958).toFixed(2)}deg) skewX(${skewDeg.toFixed(2)}deg)`
      // Glass parallax: the painted motif rides the twist, reflections counter-shift.
      const dx = Math.sin(bellPsi) * 46
      deco.setAttribute('transform', `translate(${(dx * 0.8).toFixed(2)} 0)`)
      refl.setAttribute('transform', `translate(${(-dx * 0.3).toFixed(2)} 0)`)
      // Swinging toward the viewer opens the mouth; away flattens it to a sliver.
      const mouth = Math.max(0.5, Math.min(1.9, 1 + B.z.th * DEPTH_VIEW_GAIN * 4.5))
      mouthShadow.setAttribute('transform', `translate(0 178) scale(1 ${mouth.toFixed(3)}) translate(0 -178)`)
    },
  }
}
