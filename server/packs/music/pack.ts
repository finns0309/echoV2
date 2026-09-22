// The music pack: whatever muse is playing, as one piece of media-timed content.
// Polls now-playing, fetches lyrics once per track, and re-publishes only on a
// timeline discontinuity (new track, play/pause, seek). Between those, screens
// extrapolate the media clock themselves.
import { trackKey, type LyricsService } from '@server/capabilities/lyrics/service'
import type { ContentPack, PackContext } from '@server/stage/pack-api'
import { MUSIC_CONTENT_ID, toContent, type NowPlaying } from './model'
import { createOnsetDetector, type SpectrumInput } from './signals'

export interface MusicSources {
  now(): Promise<NowPlaying | null>
  spectrum(listener: (frame: SpectrumInput) => void): () => void
}

export interface MusicPackOptions {
  sources: MusicSources
  lyrics: Pick<LyricsService, 'forTrack'>
  pollMs?: number
  /** Consecutive empty polls before the track is taken off (muse restarting, a gap between tracks). */
  goneAfter?: number
  clock?: () => number
}

export function createMusicPack({ sources, lyrics, pollMs = 800, goneAfter = 5, clock = Date.now }: MusicPackOptions) {
  let ctx: PackContext | null = null
  let timer: ReturnType<typeof setInterval> | null = null
  let offSpectrum: (() => void) | null = null
  let polling = false
  let misses = 0
  let track: { key: string; lyrics: Awaited<ReturnType<LyricsService['forTrack']>> } | null = null
  let published: { version: number; playing: boolean } | null = null

  async function poll(): Promise<void> {
    if (!ctx || polling) return
    polling = true
    try {
      const now = await sources.now()
      if (!now) {
        if (++misses >= goneAfter && published) {
          ctx.remove(MUSIC_CONTENT_ID)
          published = null
          track = null
        }
        return
      }
      misses = 0
      const key = trackKey(now)
      if (track?.key !== key) {
        const found = await lyrics.forTrack({ songId: now.songId, title: now.title, artist: now.artist, duration: now.duration })
        track = { key, lyrics: found }
        published = null // a new track always publishes
      }
      if (published && published.version === now.version && published.playing === now.playing) return
      const current = (await sources.now()) ?? now // lyrics may have taken a moment; publish the freshest clock
      if (trackKey(current) !== key) return // the track changed meanwhile; the next poll handles it
      ctx.upsert(toContent(current, track.lyrics.lines, track.lyrics.cover, clock()))
      published = { version: current.version, playing: current.playing }
    } catch (err) {
      console.error('[music]', err)
    } finally {
      polling = false
    }
  }

  const pack: ContentPack = {
    id: 'music',
    kinds: ['song'],
    start(context) {
      ctx = context
      ctx.remove(MUSIC_CONTENT_ID) // whatever a previous run left behind is stale
      const detect = createOnsetDetector()
      // Tagged with the song, so only the window showing it moves to it.
      offSpectrum = sources.spectrum((frame) => ctx?.emitSignal({ ...detect(frame), source: MUSIC_CONTENT_ID }))
      timer = setInterval(() => void poll(), pollMs)
      void poll()
    },
    stop() {
      if (timer) clearInterval(timer)
      offSpectrum?.()
      ctx = null
      timer = offSpectrum = null
    },
  }
  return Object.assign(pack, { poll })
}
