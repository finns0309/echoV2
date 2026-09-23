// The phone itself: two halves joined by a hinge down the middle, opening like a
// book. The left half (the leaf) swings on the hinge; its back is the cover
// display, so folded it lies on the right half showing the cover, and open it
// shows the left half of the inside display. The right half never moves.
import { el } from './dom'

export interface Phone {
  device: HTMLElement
  /** The cover display (the leaf's back). */
  cover: HTMLElement
  /** The inside display's two panes, either side of the hinge. */
  left: HTMLElement
  right: HTMLElement
  setOpen(open: boolean): void
}

function screen(face: HTMLElement): HTMLElement {
  const s = el('div', 'du-screen')
  face.append(s)
  return s
}

export function createPhone(root: HTMLElement): Phone {
  const device = el('div', 'du-device')
  const shadow = el('div', 'du-shadow')
  const back = el('div', 'du-half du-right')
  const leaf = el('div', 'du-leaf')
  const front = el('div', 'du-face du-inner-left')
  const cover = el('div', 'du-face du-cover')
  const right = el('div', 'du-face du-inner-right')
  back.append(right)
  leaf.append(front, cover)
  device.append(shadow, back, leaf)
  root.append(device)

  return {
    device,
    cover: screen(cover),
    left: screen(front),
    right: screen(right),
    setOpen(open) {
      device.classList.toggle('is-open', open)
    },
  }
}
