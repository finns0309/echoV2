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
    files: ['screen/**', 'cmd/screen/**', 'panel/**', 'cmd/panel/**'],
    languageOptions: { globals: globals.browser },
  },
  // Build hooks electron-builder loads with require().
  {
    files: ['scripts/**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  // Node scripts run by hand (make-strokes).
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
)
