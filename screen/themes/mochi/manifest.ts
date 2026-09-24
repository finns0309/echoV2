import type { ThemeManifest } from '@contract'

export default {
  id: 'mochi',
  label: 'もち',
  // It lives along the bottom of the screen; the rest of the window lets clicks through.
  profile: 'overlay',
  slots: {
    // What arrives: it says it, in a speech bubble.
    card: { accepts: ['text', 'value', 'progress', 'image'], timelines: ['self', 'wall', 'none'], role: 'main' },
    // What plays: it sways to it and hums the line.
    media: { accepts: ['text'], timelines: ['media'], role: 'side' },
  },
  signals: ['energy', 'onset'],
} satisfies ThemeManifest
