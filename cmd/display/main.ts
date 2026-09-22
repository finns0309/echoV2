// Composition root for the display server (Electron main process).
// Assembly only: construct the layers, wire them together, open surfaces.
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, net, type BrowserWindow } from 'electron'
import { ThemeManifest, type Grammar } from '@contract'
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
import type { SurfaceConfig } from '@server/stage/scheduler'
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

  // Shell: which surfaces exist and what they wear.
  const prefs = createShellPrefs(store, [{ id: 'main', theme: DEFAULT_THEME }])
  const surfaces = (): SurfaceConfig[] =>
    prefs.get().flatMap((p) => {
      const manifest = manifests[p.theme] ?? manifests[DEFAULT_THEME]
      return manifest ? [{ id: p.id, theme: manifest.id, profile: manifest.window }] : []
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
  const director = createDirector({ cacheDir: join(userData, 'director-cache'), llm, log: console.log })
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
  const windows = new Map<string, Surface>()
  for (const s of surfaces()) {
    const surface = createSurface({ id: s.id, preload: PRELOAD, prefs })
    surface.wear(s.theme, s.profile)
    windows.set(s.id, surface)
    channel.attach(surface.win)
    void loadScreen(surface.win, s.id)
  }

  const main = windows.get('main')
  if (main) {
    createTray({
      icon: join(app.getAppPath(), 'assets/trayTemplate.png'),
      themes: Object.values(manifests).map((m) => ({ id: m.id, label: m.label })),
      surface: main,
      onPickTheme: (id) => prefs.setTheme('main', id),
    })
  }
  prefs.onChange(() => {
    for (const s of surfaces()) {
      const surface = windows.get(s.id)
      if (surface && surface.state().theme !== s.theme) surface.wear(s.theme, s.profile)
    }
    service.run()
  })

  // Agent API. If the port is taken, echo still runs; agents just can't reach it.
  await startAgentApi({
    port: AGENT_PORT,
    token: loadOrCreateToken(userData),
    handlers: {
      submit: (raw) => {
        const result = card.accept(raw)
        return result.ok ? { ok: true, id: result.content.id } : result
      },
      withdraw: (id) => contents.remove(id) || contents.remove(`card:${id}`),
      contents: () =>
        contents.list().map((c) => ({ id: c.id, kind: c.kind, priority: c.priority, title: c.presentation.context.title })),
      stage: () => stage.snapshot(),
    },
  }).catch((err: unknown) => console.error(`[echo] agent API not started on ${AGENT_PORT}:`, err))
  service.run()
})

app.on('window-all-closed', () => app.quit())
