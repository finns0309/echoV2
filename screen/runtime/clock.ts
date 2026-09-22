import type { OnAir } from '@contract'

/**
 * Local time of on-air content, in seconds. Spec: docs/CONTRACT.md §3.3.
 * @param nowMs epoch milliseconds (Date.now())
 */
export function localTime(onAir: OnAir, nowMs: number): number | undefined {
  const tl = onAir.presentation.timeline
  switch (tl.kind) {
    case 'self':
      return Math.max(0, (nowMs - onAir.since) / 1000)
    case 'media':
      return tl.position + ((nowMs - tl.sampledAt) / 1000) * tl.rate
    case 'wall':
      return nowMs / 1000
    case 'none':
      return undefined
  }
}
