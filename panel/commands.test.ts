import { describe, expect, it } from 'vitest'
import type { ShellState } from '@contract'
import { homeItems, searchItems, windowItems, type Item } from './commands'

const shell: ShellState = {
  windows: [
    { id: 'main', name: 'main', theme: 'furin', route: 'music', visible: true, clickThrough: false, fill: 'normal', main: true },
    { id: 'w2', name: 'top', theme: 'plasma', route: 'card', visible: false, clickThrough: true, fill: 'full', main: false },
  ],
  themes: [
    { id: 'furin', label: '风铃' },
    { id: 'plasma', label: '流体' },
  ],
  routes: [
    { id: 'all', label: '全部内容' },
    { id: 'music', label: '只放歌词' },
    { id: 'card', label: '只放 agent 投递' },
  ],
  names: ['left', 'top', 'right'],
  presets: [{ id: 'split', label: '双风铃' }],
}

const find = (items: Item[], key: string) => items.find((i) => i.key === key)

describe('panel commands', () => {
  it('lists windows with what they show, then layout actions', () => {
    const items = homeItems(shell, (w) => (w === 'main' ? '春愁' : null))
    expect(items.map((i) => i.key)).toEqual(['s:windows', 'w:main', 'w:w2', 's:layout', 'add', 'p:split'])
    expect(find(items, 'w:main')).toMatchObject({ label: 'main', sub: '风铃 · 只放歌词', hint: '春愁', on: true })
    expect(find(items, 'w:w2')).toMatchObject({ hint: '已隐藏', on: false })
  })

  it("steps a window's settings through their values, wrapping around", () => {
    const items = windowItems(shell, 'main')
    const theme = find(items, 'theme')
    expect(theme?.kind === 'action' && theme.step?.(1)).toEqual({ type: 'setTheme', window: 'main', theme: 'plasma' })
    expect(theme?.kind === 'action' && theme.step?.(-1)).toEqual({ type: 'setTheme', window: 'main', theme: 'plasma' })
    const route = find(items, 'route')
    expect(route?.kind === 'action' && route.step?.(1)).toEqual({ type: 'setRoute', window: 'main', route: 'card' })
    // main can't be renamed or closed
    expect(find(items, 'name')).toBeUndefined()
    expect(find(items, 'close')).toBeUndefined()
  })

  it('offers only free names, and no fill switch for a full-screen theme', () => {
    const items = windowItems(shell, 'w2')
    const name = find(items, 'name')
    expect(name?.kind === 'action' && name.step?.(1)).toEqual({ type: 'rename', window: 'w2', name: 'left' })
    expect(find(items, 'fill')).toMatchObject({ value: '主题本身就是全屏' })
    expect(find(items, 'close')).toMatchObject({ danger: true, run: { type: 'closeWindow', window: 'w2' } })
  })

  it('finds commands by every term, in any order, across labels and ids', () => {
    const keys = (q: string) => searchItems(shell, q).filter((i) => i.kind !== 'section').map((i) => i.key)
    expect(keys('top 风铃')).toEqual(['w2:theme:furin'])
    expect(keys('风铃 top')).toEqual(['w2:theme:furin'])
    expect(keys('main plasma')).toEqual(['main:theme:plasma'])
    expect(keys('显示 top')).toEqual(['w2:visible'])
    expect(keys('split')).toEqual(['p:split'])
    expect(keys('关闭')).toEqual(['w2:close'])
  })

  it('offers a window\'s settings and its search commands from one definition', () => {
    const settings = windowItems(shell, 'w2').filter((i) => i.kind === 'action').map((i) => i.key)
    const commands = searchItems(shell, 'top').filter((i) => i.kind === 'action').map((i) => i.key.split(':')[1])
    // every switch or action in the settings is searchable for that window (valued settings expand per value)
    for (const key of settings.filter((k) => k !== 'theme' && k !== 'route' && k !== 'name' && k !== 'fill')) expect(commands).toContain(key)
  })
})

