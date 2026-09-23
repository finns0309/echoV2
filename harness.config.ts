// The debug pages alone: cmd/screen/harness.html and cmd/panel/harness.html on a
// plain Vite server, without Electron — so they work while the installed Echo is
// running (pnpm dev would quit on echo's single-instance lock). `pnpm harness`.
import { defineConfig } from 'vite'
import echo from './electron.vite.config'

const renderer = echo.renderer!

export default defineConfig({
  root: renderer.root,
  resolve: renderer.resolve,
  esbuild: renderer.esbuild,
  server: { port: 5199, open: '/screen/harness.html' },
})
