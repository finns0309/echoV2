// The display server's knobs: the choices a user sees and the defaults behind them.
// Naming packs is fine here: this is the composition root.
import type { Route } from '@contract'
import type { Preset } from '@server/shell/control'

export const AGENT_PORT = 10757

// Windows. 'main' always exists and is the fallback: whatever no visible window
// takes lands there, so hiding or closing a window never strands its content.
export const MAIN = 'main'

/** What a window can be told to take. The first one is "everything". */
export const ROUTES: { id: string; label: string; accepts?: Route }[] = [
  { id: 'all', label: '全部内容' },
  { id: 'music', label: '只放歌词', accepts: { packs: ['music'] } },
  { id: 'card', label: '只放 agent 投递', accepts: { packs: ['card'] } },
]

/** Names a user can give a window (menus can't take typing). Agents prefer windows by name. */
export const NAMES = ['left', 'right', 'top', 'bottom', 'side', 'stage', 'chat', 'corner']

export const PRESETS: Preset[] = [
  { id: 'split', label: '歌词 + agent 双风铃', windows: [{ theme: 'furin', route: 'music' }, { theme: 'furin', route: 'card' }] },
  { id: 'single', label: '只留一个窗口', windows: [{ route: 'all' }] },
]

/** The LLM behind the director. Defaults match the old echo; secrets.json in userData overrides. */
export const LLM_DEFAULTS = { model: 'gpt-5.6-luna', baseUrl: 'https://sub2api.pexoai.cn' }
