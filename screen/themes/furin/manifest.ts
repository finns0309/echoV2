import type { ThemeManifest } from '@contract'

export default {
  id: 'furin',
  label: '风铃',
  window: 'hanging',
  slots: {
    // The strip holds about 22 characters of vertical text before it gets too small.
    main: { accepts: ['text'], timelines: ['self', 'media', 'wall', 'none'], role: 'main', maxChars: 22 },
  },
  signals: ['energy', 'onset'],
} satisfies ThemeManifest
