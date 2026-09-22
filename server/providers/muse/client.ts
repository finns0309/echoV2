// L0 adapter for muse's local protocol (muse/NOW_PLAYING.md v1.2):
// GET 127.0.0.1:10755/now (polled) and WS /spectrum (pushed, ~30fps).
// Wire format only; it returns neutral shapes.

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>

export interface NowPlaying {
  songId: number
  title: string
  artist: string
  album: string
  cover: string
  duration: number
  /** Seconds, frame-accurate from muse's <audio>. */
  position: number
  /** Epoch ms at which `position` was sampled. */
  sampledAt: number
  playing: boolean
  /** Bumps on every timeline discontinuity (new track, play/pause, seek). */
  version: number
}

export interface SpectrumFrame {
  t: number
  bands: number[]
  rms: number
  version: number
}

const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
const text = (v: unknown) => (typeof v === 'string' ? v : '')

export function createMuseClient({ fetchImpl, base = 'http://127.0.0.1:10755' }: { fetchImpl: FetchLike; base?: string }) {
  return {
    /** Null when muse isn't running or nothing is loaded. */
    async now(): Promise<NowPlaying | null> {
      let j: Record<string, unknown>
      try {
        const res = await fetchImpl(`${base}/now`, { signal: AbortSignal.timeout(250) })
        if (!res.ok) return null
        j = (await res.json()) as Record<string, unknown>
      } catch {
        return null
      }
      if (!text(j.title)) return null
      return {
        songId: num(j.songId),
        title: text(j.title),
        artist: text(j.artist),
        album: text(j.album),
        cover: text(j.cover),
        duration: num(j.duration),
        position: num(j.currentTime),
        // Older muse builds lack positionSampledAt; anchor to "now" then.
        sampledAt: num(j.positionSampledAt) || Date.now(),
        playing: j.playing === true,
        version: num(j.stateVersion),
      }
    },

    /** Subscribe to the spectrum; reconnects every 3s while muse is away. Returns unsubscribe. */
    spectrum(listener: (frame: SpectrumFrame) => void): () => void {
      const WS = globalThis.WebSocket
      if (!WS) return () => {}
      let ws: WebSocket | null = null
      let timer: ReturnType<typeof setTimeout> | null = null
      let closed = false
      const connect = () => {
        timer = null
        if (closed) return
        try {
          ws = new WS(`${base.replace(/^http/, 'ws')}/spectrum`)
        } catch {
          return retry()
        }
        ws.addEventListener('message', (ev) => {
          try {
            const m = JSON.parse(String(ev.data)) as Record<string, unknown>
            if (m.type === 'hello' || !Array.isArray(m.bands)) return
            listener({ t: num(m.t, Date.now()), bands: m.bands.map((b) => num(b)), rms: num(m.rms), version: num(m.stateVersion) })
          } catch {
            // ignore malformed frames
          }
        })
        ws.addEventListener('close', retry)
        ws.addEventListener('error', () => ws?.close())
      }
      const retry = () => {
        ws = null
        if (!closed && !timer) timer = setTimeout(connect, 3000)
      }
      connect()
      return () => {
        closed = true
        if (timer) clearTimeout(timer)
        ws?.close()
      }
    },
  }
}
