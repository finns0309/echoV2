// A practice sheet the mochi writes a word on: washi paper, a square for each
// character with the red guide lines of a calligraphy sheet, and the word set
// down stroke by stroke in ink, in the right order, each stroke taking as long as
// it is long.
const NS = 'http://www.w3.org/2000/svg'
const BOX = 109 // KanjiVG's square
const INK_PER_S = 160 // how fast the brush moves, in the square's units
const PAUSE_S = 0.14 // the brush lifting between strokes
const CHAR_PAUSE_S = 0.35 // and between characters

function node<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string>): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v)
  return e
}

export function createBoard(stage: HTMLElement) {
  const sheet = document.createElement('div')
  sheet.className = 'mc-sheet'
  stage.append(sheet)
  let writing = 0 // bumps to stop a word being written when another replaces it

  return {
    /** Write these characters, stroke by stroke; `strokes` holds each one's paths in order. */
    write(chars: string[], strokes: string[][]): void {
      const id = ++writing
      const svg = node('svg', { viewBox: `0 0 ${BOX * chars.length} ${BOX}`, class: 'mc-sheet-svg' })
      const ink: SVGPathElement[] = []
      chars.forEach((_, i) => {
        const g = node('g', { transform: `translate(${i * BOX} 0)` })
        // the guide: a frame, a cross and the diagonals, faint red
        g.append(
          node('rect', { x: '2', y: '2', width: `${BOX - 4}`, height: `${BOX - 4}`, class: 'mc-guide-frame' }),
          node('path', { d: `M${BOX / 2} 4V${BOX - 4}M4 ${BOX / 2}H${BOX - 4}M6 6L${BOX - 6} ${BOX - 6}M${BOX - 6} 6L6 ${BOX - 6}`, class: 'mc-guide' }),
        )
        for (const d of strokes[i] ?? []) {
          const p = node('path', { d, class: 'mc-ink' })
          g.append(p)
          ink.push(p)
        }
        svg.append(g)
      })
      sheet.replaceChildren(svg)
      sheet.style.setProperty('--chars', String(chars.length))
      sheet.classList.add('is-on')

      // Hide every stroke, then draw them in turn.
      const lengths = ink.map((p) => p.getTotalLength())
      ink.forEach((p, i) => {
        p.style.strokeDasharray = `${lengths[i]}`
        p.style.strokeDashoffset = `${lengths[i]}`
      })
      let at = 0.5
      let char = 0
      let seen = strokes[0]?.length ?? 0
      ink.forEach((p, i) => {
        if (i >= seen) {
          char++
          seen += strokes[char]?.length ?? 0
          at += CHAR_PAUSE_S
        }
        const s = Math.max(0.18, lengths[i]! / INK_PER_S)
        setTimeout(() => {
          if (id !== writing) return
          p.style.transition = `stroke-dashoffset ${s}s cubic-bezier(0.4, 0, 0.3, 1)`
          p.style.strokeDashoffset = '0'
        }, at * 1000)
        at += s + PAUSE_S
      })
    },
    clear(): void {
      writing++
      sheet.classList.remove('is-on')
    },
    /** Beside the mochi, on whichever side has room, on the floor. Returns that side, and where it is. */
    place(x: number, reach: number, width: number, floor: number): { side: -1 | 1; area: { left: number; right: number; top: number } } {
      const w = sheet.offsetWidth
      const right = x + reach + w + 12 < width
      const left = right ? x + reach : Math.max(8, x - reach - w)
      sheet.style.transform = `translate(${left.toFixed(1)}px, ${-floor}px)`
      return { side: right ? 1 : -1, area: { left, right: left + w, top: floor + sheet.offsetHeight } }
    },
  }
}
