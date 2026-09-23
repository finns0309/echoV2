// The Dynamic Island, standing upright along the side as it does on the Duo. A card
// arriving opens it into a Live Activity (the app's icon, what it is, its first
// line) for a few seconds; loud ones shake it first.
import type { Salience } from '@contract'
import type { Summary } from './card'
import { el } from './dom'

const OPEN_MS = 3800

export function createIsland(screen: HTMLElement) {
  const island = el('div', 'du-island')
  const icon = el('i', 'du-app-icon')
  const text = el('div', 'du-island-text')
  const app = el('b', '')
  const line = el('span', '')
  text.append(app, line)
  island.append(icon, text)
  screen.append(island)
  let timer: ReturnType<typeof setTimeout> | undefined

  return {
    /** Open into a Live Activity for this card. */
    announce(s: Summary, salience: Salience): void {
      if (salience === 'quiet') return
      icon.textContent = s.mark
      icon.style.setProperty('--app', s.color)
      app.textContent = s.app
      line.textContent = s.body[0] ?? ''
      island.classList.remove('is-open', 'is-loud')
      void island.offsetWidth
      island.classList.add('is-open')
      if (salience === 'attention') island.classList.add('is-loud')
      clearTimeout(timer)
      timer = setTimeout(() => island.classList.remove('is-open', 'is-loud'), OPEN_MS)
    },
    dispose(): void {
      clearTimeout(timer)
    },
  }
}
