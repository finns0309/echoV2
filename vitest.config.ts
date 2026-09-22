import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

// Keep in sync with tsconfig.base.json "paths" and electron.vite.config.ts.
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@contract$/, replacement: resolve('contract/index.ts') },
      { find: /^@contract\//, replacement: resolve('contract') + '/' },
      { find: /^@server\//, replacement: resolve('server') + '/' },
      { find: /^@screen\//, replacement: resolve('screen') + '/' },
    ],
  },
  test: {
    include: ['**/*.test.ts'],
    exclude: ['node_modules/**', 'out/**'],
    environment: 'node',
  },
})
