import type { ThemeManifest } from '@contract'

export default {
  id: 'furin-v2',
  label: '风铃 V2',
  profile: 'hanging',
  slots: {
    // The card holds about 22 characters written down it before the type gets too small.
    main: { accepts: ['text', 'value', 'progress', 'image'], timelines: ['self', 'media', 'wall', 'none'], role: 'main', maxChars: 22 },
  },
  signals: ['energy', 'onset'],
} satisfies ThemeManifest
