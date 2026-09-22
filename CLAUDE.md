# echoV2

echoV2 is a desktop display. Content packs decide what to say; the stage decides when and where it appears; themes decide how it looks. Lyrics are one content pack, not the shape of the core.

## Read first

- `docs/ARCHITECTURE.md`: folder map, dependency rules, and "where does new code go".
- `docs/CONTRACT.md`: the data contract (Content, Presentation, StageState, themes, slots).
- `contract/`: the contract as zod schemas. Types come from `z.infer` and are never hand-written.

`../echo` is the old version. It is a read-only reference for porting the four themes we keep: 流体 (plasma), 新世纪 (eva), 风铃 (furin), 夜潮 (tide). Don't port anything else from it.

## Commands

```bash
pnpm dev          # run the app (electron-vite, renderer hot reload)
pnpm check        # typecheck + lint + tests, including the architecture tests
pnpm build        # Electron targets into out/, plus the MCP script into out/mcp/
```

## Rules that fail the build

`architecture/dependencies.test.ts` enforces these rules:

- Only `cmd/*` may cross layers. Server layers go `packs → capabilities → foundation`; providers are injected by `cmd/display`.
- Themes import only `screen/primitives`, `screen/tokens`, and `contract`. They never import each other, the runtime, or the server.
- Themes never mention song / lyric / muse / netease. Content knowledge lives in packs.
- `server/stage` and `screen/runtime` never name a specific theme or pack; they dispatch through what the entry points discover.
- Screen code makes no network requests; only `screen/runtime/transport*.ts` talks to the server.
- Only `server/shell`, `server/api`, and `cmd/display` import `electron`. The preload imports only `electron` and `contract/channels`.

Also: `tsconfig.node.json` has no DOM and `tsconfig.web.json` has no Node, so crossing the process boundary is a compile error.

## Conventions

- Create a folder only when a milestone needs it (see ARCHITECTURE.md §6); never create empty layers to fill the map.
- A theme lives entirely in `screen/themes/<id>/`. Only `theme.ts` and `manifest.ts` are visible from outside; `parts/` is private.
- Move a helper to `screen/primitives/` only once a second theme needs it.
- Tests sit next to the code as `*.test.ts` (Vitest).
