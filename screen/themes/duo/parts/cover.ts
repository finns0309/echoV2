// The cover display, folded: a Lock Screen. The date and a large clock, a Now
// Playing widget while something plays (its cover blurred into the wallpaper),
// and cards as notifications, the newest on top of a short stack. With nothing on
// air it goes to StandBy: just the time, very large.
import type { OnAir } from '@contract'
import type { Summary } from './card'
import { clock, dateLine, el } from './dom'

const STACK = 3

export function notification(s: Summary): HTMLElement {
  const n = el('div', 'du-note')
  const icon = el('i', 'du-app-icon', s.mark)
  icon.style.setProperty('--app', s.color)
  const head = el('div', 'du-note-head')
  head.append(el('b', '', s.app), el('span', '', '今'))
  const body = el('div', 'du-note-body')
  if (s.title) body.append(el('b', '', s.title))
  body.append(...s.body.slice(0, 2).map((t) => el('p', '', t)))
  const text = el('div', 'du-note-text')
  text.append(head, body)
  n.append(icon, text)
  return n
}

export function createCover(screen: HTMLElement) {
  const wall = el('div', 'du-wall')
  const art = el('img', 'du-wall-art')
  art.alt = ''
  wall.append(art)
  const lock = el('div', 'du-lock')
  const date = el('div', 'du-date')
  const time = el('div', 'du-time')
  const np = el('div', 'du-np')
  const npArt = el('img', 'du-np-art')
  npArt.alt = ''
  const npText = el('div', 'du-np-text')
  const npTitle = el('b', '')
  const npBy = el('span', '')
  const npLine = el('p', 'du-np-line')
  npText.append(npTitle, npBy)
  np.append(npArt, npText, npLine)
  const notes = el('div', 'du-notes')
  lock.append(date, time, np, notes)
  const standby = el('div', 'du-standby')
  const bigTime = el('div', 'du-standby-time')
  const bigDate = el('div', 'du-standby-date')
  standby.append(bigTime, bigDate)
  screen.append(wall, lock, standby)

  return {
    tick(d: Date): void {
      const t = clock(d)
      if (time.textContent !== t) time.textContent = bigTime.textContent = t
      const day = dateLine(d)
      if (date.textContent !== day) date.textContent = bigDate.textContent = day
    },

    /** What is playing, or null. */
    playing(onAir: OnAir | null): void {
      const ctx = onAir?.presentation.context
      screen.classList.toggle('has-np', !!onAir)
      screen.classList.toggle('has-art', !!ctx?.art)
      if (!onAir || !ctx) return
      if (ctx.art && art.getAttribute('src') !== ctx.art) art.src = npArt.src = ctx.art
      npTitle.textContent = ctx.title ?? ''
      npBy.textContent = ctx.byline ?? ctx.speaker?.name ?? ''
    },
    line(text: string | null): void {
      if (npLine.textContent === (text ?? '')) return
      npLine.textContent = text ?? ''
      npLine.classList.remove('is-new')
      void npLine.offsetWidth
      npLine.classList.add('is-new')
    },

    /** A card arrived: its notification goes on top; the oldest beyond a few drops off. */
    notify(s: Summary): void {
      const n = notification(s)
      n.classList.add('is-new')
      notes.prepend(n)
      while (notes.children.length > STACK) notes.lastElementChild?.remove()
    },

    /** Nothing on air: StandBy. */
    idle(on: boolean): void {
      screen.classList.toggle('is-standby', on)
    },
  }
}
