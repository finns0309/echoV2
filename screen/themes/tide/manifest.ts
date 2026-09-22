import type { ThemeManifest } from '@contract'

export default {
  id: 'tide',
  label: '夜潮',
  profile: 'ambient',
  slots: {
    main: { accepts: ['text'], timelines: ['self', 'media', 'wall', 'none'], role: 'main' },
  },
  signals: ['energy', 'onset'],
} satisfies ThemeManifest
