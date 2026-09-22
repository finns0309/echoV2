// L0 adapter for NetEase Cloud Music's public lyric and search endpoints.
// Only the wire format: headers, URLs, timeouts, one retry. Ported from echo's
// netease.js and phone-server.js. Fetch is injected (net.fetch in Electron).

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>

const HEADERS = {
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
  referer: 'https://music.163.com/',
}
const TIMEOUT_MS = 6000

export function createNeteaseClient(fetchImpl: FetchLike) {
  async function json(url: string): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetchImpl(url, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) })
        if (!res.ok) throw new Error(`netease ${res.status}`)
        return await res.json()
      } catch (err) {
        if (attempt >= 1) throw err
        await new Promise((r) => setTimeout(r, 250))
      }
    }
  }
  const pick = (v: unknown, ...path: string[]): unknown =>
    path.reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), v)
  const str = (v: unknown) => (typeof v === 'string' ? v : '')

  return {
    /**
     * Line-level LRC always comes from the classic endpoint: v1 now puts a
     * word-timed JSON blob in lrc.lyric that an [mm:ss] parser can't read.
     * v1 is used only for the verbatim (yrc) track.
     */
    async lyric(songId: number): Promise<{ lrc: string; yrc: string }> {
      let lrc = ''
      let yrc = ''
      try {
        lrc = str(pick(await json(`https://music.163.com/api/song/lyric?id=${songId}&lv=1`), 'lrc', 'lyric'))
      } catch {
        // no line lyrics
      }
      try {
        yrc = str(pick(await json(`https://music.163.com/api/song/lyric/v1?id=${songId}&tv=1&yv=1`), 'yrc', 'lyric'))
      } catch {
        // verbatim timing is optional
      }
      return { lrc, yrc }
    },

    /** Best match for title + artist. NetEase's own order often puts covers first, so re-rank. */
    async search(title: string, artist: string, duration: number): Promise<{ id: number; cover: string | null } | null> {
      const q = encodeURIComponent(`${title} ${artist}`.trim())
      const songs = pick(await json(`https://music.163.com/api/search/get?s=${q}&type=1&limit=5`), 'result', 'songs')
      if (!Array.isArray(songs) || !songs.length) return null
      const norm = (s: unknown) => str(s).toLowerCase().replace(/\s+/g, '')
      const scored = songs.map((s: Record<string, unknown>) => {
        let score = 0
        const artists = Array.isArray(s.artists) ? (s.artists as Record<string, unknown>[]) : []
        if (artists.some((a) => norm(a.name) === norm(artist))) score += 100
        if (norm(s.name) === norm(title)) score += 40
        if (duration && typeof s.duration === 'number') score += Math.max(0, 20 - Math.abs(s.duration / 1000 - duration) * 2)
        return { s, score }
      })
      scored.sort((a, b) => b.score - a.score)
      const best = scored[0]!.s
      const pic = str(pick(best, 'album', 'picUrl'))
      return typeof best.id === 'number' ? { id: best.id, cover: pic ? `${pic}?param=500y500` : null } : null
    },
  }
}
