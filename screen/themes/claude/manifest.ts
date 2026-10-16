import type { ThemeManifest } from '@contract'

export default {
  id: 'claude',
  label: 'Claude',
  // A page standing at the bottom right of the screen, wide enough for a column of prose.
  profile: 'device',
  slots: {
    // What arrives: the spark thinks, then writes it as a reply.
    card: { accepts: ['text', 'value', 'progress', 'image'], timelines: ['self', 'wall', 'none'], role: 'main' },
    // What plays: its line where the greeting was, or a status line under a reply.
    media: { accepts: ['text'], timelines: ['media'], role: 'side' },
  },
  signals: ['energy', 'onset'],
} satisfies ThemeManifest
