import type { ThemeManifest } from '@contract'

export default {
  id: 'firefly',
  label: '流萤',
  // A swarm over the whole screen; clicks pass through.
  profile: 'overlay',
  slots: {
    // What arrives: the fireflies gather and spell it.
    card: { accepts: ['text', 'value', 'progress'], timelines: ['self', 'wall', 'none'], role: 'main' },
    // What plays: they flash together on its beats, and spell its line when nothing else is on.
    media: { accepts: ['text'], timelines: ['media'], role: 'side' },
  },
  signals: ['energy', 'onset'],
} satisfies ThemeManifest
