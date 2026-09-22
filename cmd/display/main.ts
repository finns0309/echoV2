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
import { loadSecrets } from '@server/foundation/config'
import { createJsonStore } from '@server/foundation/store'
import { createCardPack } from '@server/packs/card/pack'
import { createResponsesClient } from '@server/providers/llm/responses'
import { createShellPrefs } from '@server/shell/prefs'
import { applyProfile, openSurface } from '@server/shell/surfaces'
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

function loadScreen(win: BrowserWindow, surface: string): Promise<void> {
  const devUrl = process.env.ELECTRON_RENDERER_URL
  return devUrl
    ? win.loadURL(`${devUrl}?surface=${encodeURIComponent(surface)}`)
    : win.loadFile(SCREEN_HTML, { query: { surface } })
}

app.whenReady().then(async () => {
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

  // Surfaces.
  const windows = new Map<string, BrowserWindow>()
  for (const s of surfaces()) {
    const win = openSurface({ profile: s.profile, preload: PRELOAD })
    windows.set(s.id, win)
    channel.attach(win)
    void loadScreen(win, s.id)
  }

  const tray = createTray({
    icon: join(app.getAppPath(), 'assets/trayTemplate.png'),
    themes: Object.values(manifests).map((m) => ({ id: m.id, label: m.label })),
    current: () => surfaces()[0]?.theme ?? '',
    onPickTheme: (id) => prefs.setTheme('main', id),
  })
  prefs.onChange(() => {
    for (const s of surfaces()) {
      const win = windows.get(s.id)
      if (win) applyProfile(win, s.profile)
    }
    tray.rebuild()
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
