// Composition root for the display server (Electron main process).
// Assembly only: construct the layers, wire them together, open surfaces.
// The knobs are in ./config, theme discovery in ./themes, page paths in ./pages.
import { join } from 'node:path'
import { app, net } from 'electron'
import { createAgentHandlers } from '@server/api/agent-handlers'
import { startAgentApi } from '@server/api/agent-http'
import { createPanelChannel } from '@server/api/panel-channel'
import { createScreenChannel } from '@server/api/screen-channel'
import { loadOrCreateToken } from '@server/api/token'
import { createDirector } from '@server/capabilities/director/service'
import { createLyricsService } from '@server/capabilities/lyrics/service'
import { loadSecrets } from '@server/foundation/config'
import { createJsonStore } from '@server/foundation/store'
import { createCardPack } from '@server/packs/card/pack'
import { createMusicPack } from '@server/packs/music/pack'
import { createResponsesClient } from '@server/providers/llm/responses'
import { createMuseClient } from '@server/providers/muse/client'
import { createNeteaseClient } from '@server/providers/netease/client'
import { createShellControl } from '@server/shell/control'
import { startHotkey } from '@server/shell/hotkey'
import { createPanelWindow } from '@server/shell/panel'
import { createShellPrefs } from '@server/shell/prefs'
import { createSurface } from '@server/shell/surfaces'
import { createTray } from '@server/shell/tray'
import { createContentStore } from '@server/stage/contents'
import { createStageService } from '@server/stage/service'
import { createStage } from '@server/stage/state'
import { USER_DATA_DIR } from '@contract'
import { AGENT_PORT, LLM_DEFAULTS, MAIN, NAMES, PRESETS, ROUTES } from './config'
import { HOTKEY_HELPER, PRELOAD, loadPanel, loadScreen } from './pages'
import { DEFAULT_THEME, grammars, manifests } from './themes'

// Pinned, not derived from productName: the MCP script and the README look here, and
// "Echo" would land on the old echo's folder on a case-insensitive disk.
app.setPath('userData', join(app.getPath('appData'), USER_DATA_DIR))

// One display per user: the installed app and `pnpm dev` share the agent port and the state.
const primary = app.requestSingleInstanceLock()
if (!primary) {
  console.log('[echo] already running; quitting this instance')
  app.quit()
}

app.whenReady().then(async () => {
  if (!primary) return
  const userData = app.getPath('userData')
  const store = createJsonStore(join(userData, 'state'))

  // Shell: which windows exist, what they wear and take, and whether they are showing.
  // The control is its single writer; the stage reads surfaces() from it.
  const prefs = createShellPrefs(store, [{ id: MAIN, theme: DEFAULT_THEME }])
  const channel = createScreenChannel()
  const shell = createShellControl({
    prefs,
    themes: Object.values(manifests).map((m) => ({ id: m.id, label: m.label, profile: m.window })),
    defaultTheme: DEFAULT_THEME,
    routes: ROUTES,
    names: NAMES,
    presets: PRESETS,
    main: MAIN,
    open: (id, others) => {
      const surface = createSurface({ id, preload: PRELOAD, prefs, others })
      channel.attach(surface.win)
      void loadScreen(surface.win, id)
      return surface
    },
  })

  // Director: L0 provider (Electron's net.fetch follows the system proxy) → L2 service.
  const secrets = loadSecrets(userData)
  const llm = secrets.openaiApiKey
    ? createResponsesClient(
        {
          apiKey: secrets.openaiApiKey,
          model: secrets.openaiModel ?? LLM_DEFAULTS.model,
          baseUrl: secrets.openaiBaseUrl ?? LLM_DEFAULTS.baseUrl,
        },
        (url, init) => net.fetch(url, init),
      )
    : null
  if (!llm) console.log('[echo] no openaiApiKey in secrets.json: themes use their heuristics')
  // The old echo's answers for 新世纪, found by lyrics and adopted instead of asked for again.
  const echoV1Cache = join(app.getPath('appData'), 'echo', 'director-cache')
  const director = createDirector({
    cacheDir: join(userData, 'director-cache'),
    llm,
    log: console.log,
    legacy: { eva: [{ dir: join(echoV1Cache, 'eva.v1') }, { dir: join(echoV1Cache, 'keyword.v1'), as: 'kw' }] },
  })
  for (const [theme, grammar] of grammars) director.register(theme, grammar)

  // Stage: contents, scheduling, state.
  const stage = createStage({}) // the first run fills it
  const contents = createContentStore(store, Date.now)
  const service = createStageService({
    contents,
    stage,
    manifests,
    surfaces: () => shell.surfaces(),
    emitSignal: (frame) => channel.publish('signal', frame),
    direct: (theme, presentation) => director.direct(theme, presentation),
  })
  stage.subscribe((state) => channel.publish('stage', state))
  channel.onReady(() => channel.publish('stage', stage.snapshot()))

  // Packs.
  const card = createCardPack()
  card.start(service.packContext)

  // Music: muse on loopback (plain fetch), NetEase through net.fetch (system proxy).
  const muse = createMuseClient({ fetchImpl: (url, init) => fetch(url, init) })
  const lyrics = createLyricsService({ source: createNeteaseClient((url, init) => net.fetch(url, init)) })
  const music = createMusicPack({ sources: { now: () => muse.now(), spectrum: (listener) => muse.spectrum(listener) }, lyrics })
  music.start(service.packContext)
  app.on('before-quit', () => music.stop())

  // Windows open now. The stage follows the shell; the tray and the panel are views of it.
  shell.subscribe(() => service.run())
  shell.start()

  const panelChannel = createPanelChannel({
    command: (command) => {
      const result = shell.dispatch(command)
      if (!result.ok) console.warn('[panel]', result.error)
    },
    hide: () => panel.hide(),
    ready: () => {
      panelChannel.publish('shell', shell.state())
      panelChannel.publish('stage', stage.snapshot())
    },
  })
  const panel = createPanelWindow({ preload: PRELOAD, load: loadPanel, onShow: () => panelChannel.publish('shown', null) })
  panelChannel.attach(panel.win)
  shell.subscribe((state) => panelChannel.publish('shell', state))
  stage.subscribe((state) => panelChannel.publish('stage', state))
  // The hotkey needs Input Monitoring, granted per app: only the packaged Echo asks for it
  // (ECHO_HOTKEY=1 opts a dev run in; it would ask on behalf of "Electron").
  if (app.isPackaged || process.env.ECHO_HOTKEY) {
    const hotkey = startHotkey(HOTKEY_HELPER, {
      toggle: () => panel.toggle(),
      status: (status) => console.log(`[echo] panel hotkey ⌥ + right ⌘: ${status}`),
    })
    app.on('before-quit', () => hotkey.stop())
  }

  createTray({
    icon: join(app.getAppPath(), 'assets/trayTemplate.png'),
    state: shell.state,
    subscribe: shell.subscribe,
    dispatch: shell.dispatch,
    openPanel: () => panel.show(),
  })

  // Agent API. If the port is taken, echo still runs; agents just can't reach it.
  await startAgentApi({
    port: AGENT_PORT,
    token: loadOrCreateToken(userData),
    handlers: createAgentHandlers({ accept: (raw) => card.accept(raw), contents, stage }),
  }).catch((err: unknown) => console.error(`[echo] agent API not started on ${AGENT_PORT}:`, err))
  service.run()
})

app.on('window-all-closed', () => app.quit())
