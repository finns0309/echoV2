import type { ThemeManifest } from '@contract'

export default {
  id: 'plasma',
  label: '流体',
  profile: 'ambient',
  slots: {
    main: { accepts: ['text'], timelines: ['self', 'media', 'wall', 'none'], role: 'main' },
  },
} satisfies ThemeManifest
