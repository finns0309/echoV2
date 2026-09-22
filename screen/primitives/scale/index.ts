// How much a theme drawn for a small window should grow when the window does.
// Ported from echo's app.js updateScale: 1.0 up to a diagonal that covers the
// hand-tuned window plus casual resizes, then a gentle power curve, capped so
// fullscreen on a large external display stays in proportion.

export interface ScaleCurve {
  /** Below this window diagonal (px) the scale stays exactly 1. */
  deadzoneDiag?: number
  max?: number
}

export function scaleFor(width: number, height: number, { deadzoneDiag = 900, max = 3.2 }: ScaleCurve = {}): number {
  const diag = Math.hypot(width, height)
  return diag > deadzoneDiag ? Math.min(max, Math.pow(diag / deadzoneDiag, 0.7)) : 1
}

/** Keeps `property` on `el` equal to its scale as it resizes. Returns a stop function. */
export function watchScale(el: HTMLElement, property: string, curve?: ScaleCurve): () => void {
  const update = () => el.style.setProperty(property, scaleFor(el.clientWidth, el.clientHeight, curve).toFixed(3))
  const observer = new ResizeObserver(update)
  observer.observe(el)
  update()
  return () => observer.disconnect()
}
