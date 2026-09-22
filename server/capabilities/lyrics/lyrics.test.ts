import { describe, expect, it } from 'vitest'
import { mergeLyrics, parseLRC, parseYRC } from './parse'
import { createLyricsService, type LyricsSource } from './service'

describe('parseLRC', () => {
  it('parses, sorts, and drops credits', () => {
    const lines = parseLRC('[00:00.000] 作词 : 某人\n[00:12.50]第二句\n[00:05.1]第一句\n[01:02:500]冒号分隔')
    expect(lines).toEqual([
      { time: 5.1, text: '第一句' },
      { time: 12.5, text: '第二句' },
      { time: 62.5, text: '冒号分隔' },
    ])
  })
  it('expands one line with several tags', () => {
    expect(parseLRC('[00:01.00][00:30.00]副歌').map((l) => l.time)).toEqual([1, 30])
  })
})

describe('parseYRC', () => {
  it('parses verbatim units with absolute times', () => {
    const [line] = parseYRC('{"t":0,"c":[{"tx":"作曲: x"}]}\n[1000,2000](1000,500,0)巡り(1500,1500,0)合う')
    expect(line).toEqual({
      time: 1,
      duration: 2,
      text: '巡り合う',
      units: [
        { time: 1, duration: 0.5, text: '巡り' },
        { time: 1.5, duration: 1.5, text: '合う' },
      ],
    })
  })
})

describe('mergeLyrics', () => {
  it('prefers verbatim timing and falls back to LRC', () => {
    expect(mergeLyrics({ lrc: '[00:01.00]a', yrc: '[1000,1000](1000,1000,0)b' })[0]!.text).toBe('b')
    expect(mergeLyrics({ lrc: '[00:01.00]a', yrc: '' })[0]!.text).toBe('a')
  })
})

describe('lyrics service', () => {
  const source = (calls: string[]): LyricsSource => ({
    lyric: async (id) => {
      calls.push(`lyric:${id}`)
      return { lrc: '[00:01.00]hello', yrc: '' }
    },
    search: async (title) => {
      calls.push(`search:${title}`)
      return { id: 7, cover: 'https://cover' }
    },
  })

  it('fetches by songId once and caches', async () => {
    const calls: string[] = []
    const svc = createLyricsService({ source: source(calls) })
    const track = { songId: 42, title: 't', artist: 'a', duration: 100 }
    await svc.forTrack(track)
    const again = await svc.forTrack(track)
    expect(again.lines[0]!.text).toBe('hello')
    expect(calls).toEqual(['lyric:42'])
  })

  it('searches when there is no songId, and returns the cover it found', async () => {
    const calls: string[] = []
    const svc = createLyricsService({ source: source(calls) })
    const out = await svc.forTrack({ songId: 0, title: 't', artist: 'a', duration: 100 })
    expect(calls).toEqual(['search:t', 'lyric:7'])
    expect(out.cover).toBe('https://cover')
  })
})
