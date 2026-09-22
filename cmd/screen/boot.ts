// Composition root for a screen (renderer). Assembly only.
import '@screen/tokens/base.css'
import { createStageHost } from '@screen/runtime/host'
import type { ThemeFactory } from '@screen/runtime/theme-api'
import { connect } from '@screen/runtime/transport'

// Themes are discovered by folder and loaded lazily. Keys look like
// "../../screen/themes/furin/theme.ts"; the folder name is the theme id.
const themes: Record<string, () => Promise<{ default: ThemeFactory }>> = {}
for (const [path, load] of Object.entries(import.meta.glob<{ default: ThemeFactory }>('../../screen/themes/*/theme.ts'))) {
  const id = path.split('/').at(-2)
  if (id) themes[id] = load
}

const surface = new URLSearchParams(location.search).get('surface') ?? 'main'
const root = document.getElementById('stage')
if (!root) throw new Error('#stage missing from index.html')

const bridge = connect()
const host = createStageHost({ root, surface, themes, bridge })
bridge.on('stage', (state) => host.render(state))
bridge.send('ready', { screen: surface })
