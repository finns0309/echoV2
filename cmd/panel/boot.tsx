// Composition root for the panel (renderer). Assembly only.
import '@panel/panel.css'
import { render } from 'preact'
import { App } from '@panel/app'
import { connect } from '@panel/bridge'
import { createPanelState } from '@panel/state'

const root = document.getElementById('panel')
if (!root) throw new Error('#panel missing from index.html')

const bridge = connect()
const state = createPanelState(bridge)
render(<App state={state} />, root)
bridge.send('ready', null)
