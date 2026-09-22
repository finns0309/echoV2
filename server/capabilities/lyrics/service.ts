// L2 lyrics gateway: the stable "lyrics for this track" capability. Owns
// caching and the choice between verbatim and line-level timing. The provider
// (NetEase today) is injected; this file never sees its wire format.
import { mergeLyrics, type LyricLine } from './parse'

export type { LyricLine } from './parse'

export interface Track {
  songId: number
  title: string
  artist: string
  duration: number
}

/** What a lyrics provider must offer. The NetEase provider matches this shape. */
export interface LyricsSource {
  lyric(songId: number): Promise<{ lrc: string; yrc: string }>
  search(title: string, artist: string, duration: number): Promise<{ id: number; cover: string | null } | null>
}

const MAX_ENTRIES = 128

/** One key per track: its id when known, else its title and artist. */
export const trackKey = (track: Pick<Track, 'songId' | 'title' | 'artist'>) =>
  track.songId ? `id:${track.songId}` : `q:${track.title}|${track.artist}`

export function createLyricsService({ source }: { source: LyricsSource }) {
  const cache = new Map<string, { lines: LyricLine[]; cover: string | null }>()
  const put = (key: string, value: { lines: LyricLine[]; cover: string | null }) => {
    cache.delete(key)
    cache.set(key, value)
    if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!)
    return value
  }

  return {
    /** Lyrics (and a cover when a search had to find the track). Empty lines = instrumental or unknown. */
    async forTrack(track: Track): Promise<{ lines: LyricLine[]; cover: string | null }> {
      const key = trackKey(track)
      const hit = cache.get(key)
      if (hit) return put(key, hit)
      let id = track.songId
      let cover: string | null = null
      if (!id) {
        const found = await source.search(track.title, track.artist, track.duration).catch(() => null)
        if (!found) return { lines: [], cover: null } // not cached: a later try may find it
        id = found.id
        cover = found.cover
      }
      const raw = await source.lyric(id).catch(() => null)
      if (!raw) return { lines: [], cover }
      return put(key, { lines: mergeLyrics(raw), cover })
    },
  }
}

export type LyricsService = ReturnType<typeof createLyricsService>
