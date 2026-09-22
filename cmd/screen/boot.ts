// Composition root for a screen (renderer). Assembly only.
import '@screen/tokens/base.css'
import { createStageHost } from '@screen/runtime/host'
import { connect } from '@screen/runtime/transport'

const surface = new URLSearchParams(location.search).get('surface') ?? 'main'
const root = document.getElementById('stage')
if (!root) throw new Error('#stage missing from index.html')

const host = createStageHost(root, surface)
const bridge = connect()
bridge.on('stage', (state) => host.render(state))
bridge.send('ready', { screen: surface })
