import type { ThemeManifest } from '@contract'

export default {
  id: 'claude',
  label: 'Claude',
  // A page standing at the bottom right of the screen, wide enough for a column of prose.
  profile: 'device',
  slots: {
    // What is said: the spark thinks, then writes it as a reply in the conversation of its topic.
    chat: { accepts: ['text', 'value', 'progress', 'image'], timelines: ['self', 'wall'], role: 'main' },
    // What stays and changes (a status, a figure, a bar): an artifact open beside the conversation.
    artifact: { accepts: ['value', 'progress', 'text', 'image'], timelines: ['none'], role: 'side' },
    // What plays: its line where the greeting was, or a status line under a reply.
    media: { accepts: ['text'], timelines: ['media'], role: 'side' },
  },
  signals: ['energy', 'onset'],
} satisfies ThemeManifest
