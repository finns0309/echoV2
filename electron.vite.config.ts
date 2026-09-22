import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'

// Keep in sync with tsconfig.base.json "paths" and vitest.config.ts.
const alias = [
  { find: /^@contract$/, replacement: resolve('contract/index.ts') },
  { find: /^@contract\//, replacement: resolve('contract') + '/' },
  { find: /^@server\//, replacement: resolve('server') + '/' },
  { find: /^@screen\//, replacement: resolve('screen') + '/' },
  { find: /^@panel\//, replacement: resolve('panel') + '/' },
]

export default defineConfig({
  // Display server (Electron main process). Dependencies are bundled in, so the
  // packaged app carries no node_modules.
  main: {
    resolve: { alias },
    build: {
      externalizeDeps: false,
      outDir: resolve('out/main'),
      rollupOptions: { input: { main: resolve('cmd/display/main.ts') } },
    },
  },
  // Sandboxed preloads can't be ES modules or load sibling chunks, so there is one
  // preload, emitted as a single CommonJS file; it serves both screens and the panel.
  preload: {
    resolve: { alias },
    build: {
      outDir: resolve('out/preload'),
      rollupOptions: {
        input: { preload: resolve('cmd/display/preload.ts') },
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  // Renderer pages: the screen (every display window) and the panel.
  renderer: {
    root: resolve('cmd'),
    resolve: { alias },
    // The panel is Preact; esbuild compiles its JSX.
    esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
    build: {
      outDir: resolve('out/renderer'),
      rollupOptions: { input: { screen: resolve('cmd/screen/index.html'), panel: resolve('cmd/panel/index.html') } },
    },
  },
})
