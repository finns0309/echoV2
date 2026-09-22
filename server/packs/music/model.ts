// What the music pack needs to know about "now playing", and how that becomes Content.
import type { Content } from '@contract'
import type { LyricLine } from '@server/capabilities/lyrics/service'
import { present } from './present'

export const MUSIC_CONTENT_ID = 'music:now'

/** The playback facts the pack works from. muse's provider produces this shape. */
export interface NowPlaying {
  songId: number
  title: string
  artist: string
  cover: string
  duration: number
  position: number
  sampledAt: number
  playing: boolean
  version: number
}

/** Same track = same songId, or the same title and artist when there is no id. */
export const trackKey = (n: NowPlaying) => (n.songId ? `id:${n.songId}` : `q:${n.title}|${n.artist}`)

export function toContent(now: NowPlaying, lines: readonly LyricLine[], cover: string | null, createdAt: number): Content {
  return {
    id: MUSIC_CONTENT_ID,
    pack: 'music',
    kind: 'song',
    // Playing: lyrics hold the stage, other content cuts in only at breaks.
    // Paused: anything more important may take over until it plays again.
    priority: now.playing ? 'normal' : 'ambient',
    createdAt,
    presentation: present(now, lines, cover),
  }
}
