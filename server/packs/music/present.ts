import type { Block, Presentation } from '@contract'
import type { LyricLine } from '@server/capabilities/lyrics/service'
import { computeBreaks } from './breaks'
import type { NowPlaying } from './model'

/** One text block per line; verbatim units become block `timing` (relative seconds + length). */
function toBlock(line: LyricLine): Block {
  const block: Block = { type: 'text', role: 'primary', text: line.text, at: line.time }
  if (line.units?.length) {
    block.timing = line.units.map((u) => ({ at: Math.max(0, u.time - line.time), len: [...u.text].length }))
  }
  return block
}

export function present(now: NowPlaying, lines: readonly LyricLine[], cover: string | null): Presentation {
  const art = now.cover || cover || undefined
  return {
    context: {
      title: now.title,
      ...(now.artist ? { byline: now.artist, speaker: { name: now.artist } } : {}),
      ...(art ? { art } : {}),
    },
    timeline: { kind: 'media', position: now.position, sampledAt: now.sampledAt, rate: now.playing ? 1 : 0, version: now.version },
    // An instrumental track still has something to show: its title.
    blocks: lines.length ? lines.map(toBlock) : [{ type: 'text', role: 'primary', text: now.title, at: 0 }],
    hints: { breaks: computeBreaks(lines, now.duration) },
    ext: { 'music.songId': now.songId },
  }
}
