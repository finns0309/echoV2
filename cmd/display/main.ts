// Composition root for the display server (Electron main process).
// Assembly only: construct the layers, wire them together, open surfaces.
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, net, type BrowserWindow } from 'electron'
import { ThemeManifest, type Grammar, type Route } from '@contract'
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
import { createSurface, type Surface } from '@server/shell/surfaces'
import { createTray } from '@server/shell/tray'
import { createContentStore } from '@server/stage/contents'
import { waitingOrder, type SurfaceConfig } from '@server/stage/scheduler'
import { createStageService } from '@server/stage/service'
import { createStage } from '@server/stage/state'

const AGENT_PORT = 10757
const PRELOAD = fileURLToPath(new URL('../preload/preload.cjs', import.meta.url))
const SCREEN_HTML = fileURLToPath(new URL('../renderer/index.html', import.meta.url))

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
const routeOf = (accepts: Route | undefined) =>
  ROUTES.find((r) => JSON.stringify(r.accepts) === JSON.stringify(accepts))?.id ?? 'all'
const PRESETS = [
  { id: 'split', label: '歌词 + agent 双风铃' },
  { id: 'single', label: '只留一个窗口' },
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

function loadScreen(win: BrowserWindow, surface: string): Promise<void> {
  const devUrl = process.env.ELECTRON_RENDERER_URL
  return devUrl
    ? win.loadURL(`${devUrl}?surface=${encodeURIComponent(surface)}`)
    : win.loadFile(SCREEN_HTML, { query: { surface } })
}

app.whenReady().then(async () => {
  if (!primary) return
  const userData = app.getPath('userData')
  const store = createJsonStore(join(userData, 'state'))

  // Shell: which surfaces exist, what they wear and take, and whether they are showing.
  const prefs = createShellPrefs(store, [{ id: MAIN, theme: DEFAULT_THEME }])
  const windows = new Map<string, Surface>()
  const surfaces = (): SurfaceConfig[] =>
    prefs.get().flatMap((p) => {
      const manifest = manifests[p.theme] ?? manifests[DEFAULT_THEME]
      if (!manifest) return []
      return [
        {
          id: p.id,
          theme: manifest.id,
          profile: manifest.window,
          ...(p.accepts ? { accepts: p.accepts } : {}),
          ...(p.id === MAIN ? { fallback: true } : {}),
          ...(windows.get(p.id)?.state().visible === false ? { hidden: true } : {}),
        },
      ]
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
  const channel = createScreenChannel()
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

  // Surfaces: one window each, wearing its theme (or where the user last left it for that theme).
  // Windows follow the prefs: added, re-themed and closed as they change.
  let tray: ReturnType<typeof createTray> | null = null
  function reconcile(): void {
    const wanted = surfaces()
    for (const s of wanted) {
      let surface = windows.get(s.id)
      if (!surface) {
        const others = [...windows.values()]
        surface = createSurface({ id: s.id, preload: PRELOAD, prefs, others: () => others.map((o) => o.bounds()) })
        windows.set(s.id, surface)
        surface.onChange(() => {
          tray?.rebuild()
          service.run() // hiding or showing a window reroutes content
        })
        channel.attach(surface.win)
        surface.wear(s.theme, s.profile)
        void loadScreen(surface.win, s.id)
      } else if (surface.state().theme !== s.theme) {
        surface.wear(s.theme, s.profile)
      }
    }
    for (const [id, surface] of windows) {
      if (wanted.some((s) => s.id === id)) continue
      windows.delete(id)
      surface.destroy()
    }
    tray?.rebuild()
    service.run()
  }

  function preset(id: string): void {
    const extras = prefs.get().filter((p) => p.id !== MAIN)
    if (id === 'single') {
      for (const p of extras) prefs.remove(p.id)
      prefs.setRoute(MAIN, undefined)
      return
    }
    if (id === 'split') {
      const theme = manifests.furin ? 'furin' : DEFAULT_THEME
      prefs.setTheme(MAIN, theme)
      prefs.setRoute(MAIN, ROUTES.find((r) => r.id === 'music')!.accepts)
      const agent = extras[0]
      if (agent) {
        prefs.setTheme(agent.id, theme)
        prefs.setRoute(agent.id, ROUTES.find((r) => r.id === 'card')!.accepts)
      } else prefs.add({ id: `win-${Date.now().toString(36)}`, theme, accepts: ROUTES.find((r) => r.id === 'card')!.accepts })
    }
  }

  reconcile()
  tray = createTray({
    icon: join(app.getAppPath(), 'assets/trayTemplate.png'),
    themes: Object.values(manifests).map((m) => ({ id: m.id, label: m.label })),
    routes: ROUTES,
    presets: PRESETS,
    windows: () =>
      prefs.get().flatMap((p) => {
        const surface = windows.get(p.id)
        return surface ? [{ id: p.id, surface, route: routeOf(p.accepts), closable: p.id !== MAIN }] : []
      }),
    onPickTheme: (window, theme) => prefs.setTheme(window, theme),
    onPickRoute: (window, route) => prefs.setRoute(window, ROUTES.find((r) => r.id === route)?.accepts),
    onAddWindow: () => prefs.add({ id: `win-${Date.now().toString(36)}`, theme: prefs.get().at(-1)?.theme ?? DEFAULT_THEME }),
    onCloseWindow: (window) => prefs.remove(window),
    onPreset: preset,
  })
  prefs.onChange(reconcile)

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
        const surface = Object.entries(stage.snapshot().surfaces).find(([, s]) =>
          Object.values(s.slots).some((slot) => slot?.contentId === id),
        )?.[0]
        return surface
          ? { ok: true, id, updated: existed.has(id), state: 'on-air', surface }
          : { ok: true, id, updated: existed.has(id), state: 'queued' }
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
