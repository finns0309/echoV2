// Spectrum frames → the signals themes listen to: energy (loudness), onsets
// (spectral-flux beats) and the spectral centroid. Ported from echo's audio.js;
// thresholds unchanged. Onset detection lives here, so screens stay dumb.
import type { SignalFrame } from '@contract'

const ONSET_FLUX = 0.07 // spectral-flux threshold for a hard onset
const ONSET_MIN_GAP_MS = 85 // floor between onsets (~12/s max)

export interface SpectrumInput {
  t: number
  bands: number[]
  rms: number
  /** A change means a discontinuity (track change, seek): don't compare across it. */
  version: number
}

export function createOnsetDetector() {
  let prev: Float32Array | null = null
  let lastVersion = -1
  let lastOnsetAt = -Infinity

  return (frame: SpectrumInput): SignalFrame => {
    const { bands } = frame
    let num = 0
    let den = 0
    bands.forEach((b, i) => {
      num += b * i
      den += b
    })
    const centroid = den > 0 && bands.length > 1 ? num / den / (bands.length - 1) : 0.5
    const out: SignalFrame = { t: frame.t, energy: frame.rms, centroid }

    if (frame.version !== lastVersion) {
      lastVersion = frame.version
      prev = null
    }
    if (prev && prev.length === bands.length) {
      let flux = 0
      for (let i = 0; i < bands.length; i++) {
        const d = bands[i]! - prev[i]!
        if (d > 0) flux += d
      }
      flux /= bands.length * 0.25 // normalized so the threshold stays genre-agnostic
      if (flux > ONSET_FLUX && frame.t - lastOnsetAt >= ONSET_MIN_GAP_MS) {
        lastOnsetAt = frame.t
        out.onset = Math.min(1, 0.6 + flux * 1.2)
      }
    }
    prev = Float32Array.from(bands)
    return out
  }
}
