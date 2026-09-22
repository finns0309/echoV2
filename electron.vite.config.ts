import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'

// Keep in sync with tsconfig.base.json "paths" and vitest.config.ts.
const alias = [
  { find: /^@contract$/, replacement: resolve('contract/index.ts') },
  { find: /^@contract\//, replacement: resolve('contract') + '/' },
  { find: /^@server\//, replacement: resolve('server') + '/' },
  { find: /^@screen\//, replacement: resolve('screen') + '/' },
]

export default defineConfig({
  // Display server (Electron main process).
  main: {
    resolve: { alias },
    build: {
      outDir: resolve('out/main'),
      rollupOptions: { input: { main: resolve('cmd/display/main.ts') } },
    },
  },
  // Sandboxed preloads can't be ES modules, so this one is emitted as CommonJS.
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
  // Screen (renderer).
  renderer: {
    root: resolve('cmd/screen'),
    resolve: { alias },
    build: {
      outDir: resolve('out/renderer'),
      rollupOptions: { input: resolve('cmd/screen/index.html') },
    },
  },
})
