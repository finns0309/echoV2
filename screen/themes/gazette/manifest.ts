import type { SlotSpec, ThemeManifest } from '@contract'

const story = (role: SlotSpec['role']): SlotSpec => ({ accepts: ['text', 'value', 'progress', 'image'], timelines: ['self', 'wall', 'none'], role })

export default {
  id: 'gazette',
  label: '晨报',
  profile: 'ambient',
  // A front page: the lead story, three columns beside it, and a literary box where
  // whatever is playing is set line by line. Several stories share the page.
  slots: {
    lead: story('main'),
    col1: story('side'),
    col2: story('side'),
    col3: story('side'),
    verse: { accepts: ['text'], timelines: ['media'], role: 'ambient' },
  },
} satisfies ThemeManifest
