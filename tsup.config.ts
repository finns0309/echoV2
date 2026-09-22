import { defineConfig } from 'tsup'

// Entry points that run outside Electron (spawned by agents) are plain Node scripts,
// self-contained so they run from the packaged app's Resources without node_modules.
export default defineConfig({
  entry: { mcp: 'cmd/mcp/main.ts' },
  outDir: 'out/mcp',
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  tsconfig: 'tsconfig.node.json',
  noExternal: [/.*/],
  clean: true,
  banner: { js: '#!/usr/bin/env node' },
})
