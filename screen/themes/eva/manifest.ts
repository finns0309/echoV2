import type { ThemeManifest } from '@contract'

export default {
  id: 'eva',
  label: '新世纪',
  profile: 'ambient',
  slots: {
    main: { accepts: ['text'], timelines: ['self', 'media', 'wall', 'none'], role: 'main' },
  },
} satisfies ThemeManifest
