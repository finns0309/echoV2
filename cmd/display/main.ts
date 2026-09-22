// Composition root for the display server (Electron main process).
// Assembly only: construct the layers, wire them together, open surfaces.
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, net, type BrowserWindow } from 'electron'
import { ThemeManifest, type Content, type Grammar, type Route, type Surface as StageSurface } from '@contract'
import { startAgentApi } from '@server/api/agent-http'
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
import { createShellPrefs } from '@server/shell/prefs'
import { createPanelChannel } from '@server/api/panel-channel'
import { createShellControl, type Preset } from '@server/shell/control'
import { startHotkey } from '@server/shell/hotkey'
import { createPanelWindow } from '@server/shell/panel'
import { createSurface } from '@server/shell/surfaces'
import { createTray } from '@server/shell/tray'
import { createContentStore } from '@server/stage/contents'
import { admits, waitingOrder } from '@server/stage/scheduler'
import { createStageService } from '@server/stage/service'
import { createStage } from '@server/stage/state'

const AGENT_PORT = 10757
const PRELOAD = fileURLToPath(new URL('../preload/preload.cjs', import.meta.url))
const SCREEN_HTML = fileURLToPath(new URL('../renderer/screen/index.html', import.meta.url))
const PANEL_HTML = fileURLToPath(new URL('../renderer/panel/index.html', import.meta.url))
// The ⌥ + right ⌘ helper: in the app's Resources when packaged, in out/native in development.
const HOTKEY = app.isPackaged
  ? join(process.resourcesPath, 'echo-hotkey')
  : fileURLToPath(new URL('../native/echo-hotkey', import.meta.url))

// Themes are discovered by folder. The display server only ever loads manifests.
const manifests: Record<string, ThemeManifest> = {}
for (const mod of Object.values(import.meta.glob<{ default: unknown }>('../../screen/themes/*/manifest.ts', { eager: true }))) {
  const manifest = ThemeManifest.parse(mod.default)
  manifests[manifest.id] = manifest
}
const DEFAULT_THEME = manifests.furin ? 'furin' : (Object.keys(manifests)[0] ?? '')

// Director grammars are discovered the same way: screen/themes/<id>/grammar.ts.
const grammars: [string, Grammar][] = Object.entries(
  import.meta.glob<{ default: Grammar }>('../../screen/themes/*/grammar.ts', { eager: true }),
).flatMap(([path, mod]) => {
  const id = path.split('/').at(-2)
  return id ? [[id, mod.default] as [string, Grammar]] : []
})

// Windows. 'main' always exists and is the fallback: whatever no visible window
// takes lands there, so hiding or closing a window never strands its content.
const MAIN = 'main'
// What a window can be told to take. Naming packs is fine here: this is the composition root.
const ROUTES: { id: string; label: string; accepts?: Route }[] = [
  { id: 'all', label: '全部内容' },
  { id: 'music', label: '只放歌词', accepts: { packs: ['music'] } },
  { id: 'card', label: '只放 agent 投递', accepts: { packs: ['card'] } },
]
// Names a user can give a window (menus can't take typing). Agents prefer windows by name.
const NAMES = ['left', 'right', 'top', 'bottom', 'side', 'stage', 'chat', 'corner']
const PRESETS: Preset[] = [
  { id: 'split', label: '歌词 + agent 双风铃', windows: [{ theme: 'furin', route: 'music' }, { theme: 'furin', route: 'card' }] },
  { id: 'single', label: '只留一个窗口', windows: [{ route: 'all' }] },
]

// The LLM behind the director. Defaults match the old echo; secrets.json in userData overrides.
const LLM_DEFAULTS = { model: 'gpt-5.6-luna', baseUrl: 'https://sub2api.pexoai.cn' }

// Pinned, not derived from productName: the MCP script and the README look here, and
// "Echo" would land on the old echo's folder on a case-insensitive disk.
app.setPath('userData', join(app.getPath('appData'), 'echo-v2'))

// One display per user: the installed app and `pnpm dev` share the agent port and the state.
const primary = app.requestSingleInstanceLock()
if (!primary) {
  console.log('[echo] already running; quitting this instance')
  app.quit()
}

// Why a window preference wasn't honoured, in words an agent can pass on. Null when it was, or there was none.
function preferenceNote(content: Content, windows: StageSurface[]): string | null {
  if (!content.window) return null
  const target = windows.find((w) => w.name === content.window)
  const names = windows.flatMap((w) => (w.name ? [w.name] : [])).join(', ')
  if (!target) return `there is no window named ${content.window} (windows: ${names}); it went where it normally would`
  if (target.hidden) return `${content.window} is hidden; it went where it normally would`
  if (!admits(target.accepts, content)) return `${content.window} doesn't take this kind of card (the user's route); it went where it normally would`
  return null
}

function loadScreen(win: BrowserWindow, surface: string): Promise<void> {
  const devUrl = process.env.ELECTRON_RENDERER_URL
  return devUrl
    ? win.loadURL(`${devUrl}/screen/index.html?surface=${encodeURIComponent(surface)}`)
    : win.loadFile(SCREEN_HTML, { query: { surface } })
}

function loadPanel(win: BrowserWindow): Promise<void> {
  const devUrl = process.env.ELECTRON_RENDERER_URL
  return devUrl ? win.loadURL(`${devUrl}/panel/index.html`) : win.loadFile(PANEL_HTML)
}

app.whenReady().then(async () => {
  if (!primary) return
  const userData = app.getPath('userData')
  const store = createJsonStore(join(userData, 'state'))

  // Shell: which windows exist, what they wear and take, and whether they are showing.
  // The control is its single writer; the stage reads surfaces() from it.
  const prefs = createShellPrefs(store, [{ id: MAIN, theme: DEFAULT_THEME }])
  let onWindowsChanged = () => {}
  const channel = createScreenChannel()
  const shell = createShellControl({
    prefs,
    themes: Object.values(manifests).map((m) => ({ id: m.id, label: m.label, profile: m.window })),
    defaultTheme: DEFAULT_THEME,
    routes: ROUTES,
    names: NAMES,
    presets: PRESETS,
    main: MAIN,
    open: (id) => {
      const surface = createSurface({ id, preload: PRELOAD, prefs, others: () => otherBounds(id) })
      channel.attach(surface.win)
      void loadScreen(surface.win, id)
      opened.set(id, surface)
      return {
        ...surface,
        destroy: () => {
          opened.delete(id)
          surface.destroy()
        },
      }
    },
    onWindowsChanged: () => onWindowsChanged(),
  })
  const opened = new Map<string, ReturnType<typeof createSurface>>()
  const otherBounds = (id: string) => [...opened].flatMap(([other, s]) => (other === id ? [] : [s.bounds()]))
  const surfaces = () => shell.surfaces()

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
  const stage = createStage(Object.fromEntries(surfaces().map((s) => [s.id, { profile: s.profile, theme: s.theme, slots: {} }])))
  const contents = createContentStore(store, Date.now)
  const service = createStageService({
    contents,
    stage,
    manifests,
    surfaces,
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

  // Windows open now. The tray and the panel are both views of the shell.
  onWindowsChanged = () => service.run()
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
    const hotkey = startHotkey(HOTKEY, {
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
    handlers: {
      // Accepting runs the scheduler synchronously, so the stage already tells where the card went.
      submit: (raw) => {
        const existed = new Set(contents.list().map((c) => c.id))
        const result = card.accept(raw)
        if (!result.ok) return result
        const id = result.content.id
        const all = Object.entries(stage.snapshot().surfaces)
        const at = all.find(([, s]) => Object.values(s.slots).some((slot) => slot?.contentId === id))
        const window = at ? (at[1].name ?? at[0]) : undefined
        const together = result.content.together
        const arrived = together ? contents.list().filter((c) => c.together?.id === together.id).length : 0
        const note =
          [
            preferenceNote(result.content, all.map(([, s]) => s)),
            together && !at && arrived < together.of
              ? `waiting for ${together.of - arrived} more of ensemble ${together.id} before any of it shows`
              : null,
          ]
            .filter(Boolean)
            .join('; ') || null
        return {
          ok: true,
          id,
          updated: existed.has(id),
          state: at ? 'on-air' : 'queued',
          ...(window ? { surface: window } : {}),
          ...(note ? { note } : {}),
        }
      },
      withdraw: (id) => contents.remove(id) || contents.remove(`card:${id}`),
      withdrawGroup: (group) => contents.removeGroup(group),
      // In the order they will go on air.
      contents: () =>
        [...contents.list()].sort(waitingOrder).map((c) => ({
          id: c.id,
          kind: c.kind,
          priority: c.priority,
          title: c.presentation.context.title,
          ...(c.repeat ? { repeat: true } : {}),
          ...(c.group ? { group: c.group } : {}),
        })),
      stage: () => stage.snapshot(),
    },
  }).catch((err: unknown) => console.error(`[echo] agent API not started on ${AGENT_PORT}:`, err))
  service.run()
})

app.on('window-all-closed', () => app.quit())
