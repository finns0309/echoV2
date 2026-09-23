import type { ThemeManifest } from '@contract'

export default {
  id: 'duo',
  label: 'Duo',
  // A foldable phone standing on the desk, with room to open to its left.
  profile: 'device',
  slots: {
    // What arrives: a notification on the cover, a chat on the inside.
    card: { accepts: ['text', 'value', 'progress', 'image'], timelines: ['self', 'wall', 'none'], role: 'main' },
    // What plays: Now Playing on the cover, the player's own pane on the inside.
    media: { accepts: ['text'], timelines: ['media'], role: 'side' },
  },
} satisfies ThemeManifest
