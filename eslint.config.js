import js from '@eslint/js'
import { defineConfig } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig(
  { ignores: ['out/**', 'dist/**', 'node_modules/**'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['server/**', 'cmd/display/**', 'cmd/mcp/**', 'architecture/**', '*.config.{ts,js}'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['screen/**', 'cmd/screen/**'],
    languageOptions: { globals: globals.browser },
  },
)
