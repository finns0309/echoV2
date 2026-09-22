// Floating text cards at the center: each new text becomes a card of
// per-character spans that waves in, while older cards drift up and blur away.
// Ported from echo's app.js renderStage().

const LEAVE_MS = 2200 // matches the CSS leave choreography
const MAX_CARDS = 4

export function createCards(stage: HTMLElement) {
  function leaveAll(): void {
    for (const c of stage.querySelectorAll('.stage-card:not(.leaving)')) {
      c.classList.add('leaving')
      setTimeout(() => c.remove(), LEAVE_MS + 200)
    }
    while (stage.children.length > MAX_CARDS) stage.firstElementChild?.remove()
  }

  return {
    show(text: string, reading?: string): void {
      leaveAll()
      const card = document.createElement('div')
      card.className = 'stage-card'
      ;[...text].forEach((ch, i) => {
        const w = document.createElement('span')
        w.className = 'w'
        w.style.setProperty('--fd', `${(3.8 + Math.random() * 3.5).toFixed(2)}s`)
        w.style.setProperty('--fdelay', `${(-Math.random() * 6).toFixed(2)}s`)
        w.style.setProperty('--fy', `${(1.4 + Math.random() * 2).toFixed(2)}px`)
        const wi = document.createElement('span')
        wi.className = 'wi'
        wi.style.setProperty('--i', String(i))
        // A lone space must survive whitespace collapsing between inline-blocks.
        wi.textContent = ch === ' ' ? '\u00a0' : ch
        w.appendChild(wi)
        card.appendChild(w)
      })
      if (reading) {
        const r = document.createElement('div')
        r.className = 'stage-reading'
        r.textContent = reading
        card.appendChild(r)
      }
      stage.appendChild(card)
    },

    clear(): void {
      leaveAll()
    },
  }
}
