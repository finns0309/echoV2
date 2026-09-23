import { describe, expect, it } from 'vitest'
import { homeItems, searchItems, windowItems, type Item } from './commands'
import { busy, scene } from './fixture'

const find = (items: Item[], key: string) => items.find((i) => i.key === key)
const keys = (items: Item[]) => items.filter((i) => i.kind === 'action' || i.kind === 'window').map((i) => i.key)

describe('panel commands', () => {
  it('lists the windows with what they show, and a way to add one', () => {
    const items = homeItems(scene)
    expect(items.map((i) => i.key)).toEqual(['s:windows', 'w:main', 'w:w2', 'new', 'pause'])
    expect(find(items, 'w:main')).toMatchObject({ label: 'main', sub: '风铃 · 只放歌词', hint: '春愁', on: true })
    expect(find(items, 'w:w2')).toMatchObject({ hint: '已隐藏', on: false })
    expect(find(items, 'new')).toMatchObject({ run: { type: 'addWindow' } })
    expect(find(items, 'pause')).toMatchObject({ on: false, run: { type: 'setPaused', on: true } })
    expect(find(homeItems(busy(true)), 'pause')).toMatchObject({ on: true, run: { type: 'setPaused', on: false } })
  })

  it('offers skipping and clearing only where there is a card to move, not a song', () => {
    expect(find(windowItems(scene, 'main'), 'skip')).toBeUndefined()
    const top = windowItems(busy(), 'w2')
    expect(find(top, 'skip')).toMatchObject({ run: { type: 'skip', window: 'w2' } })
    expect(find(top, 'clear')).toMatchObject({ run: { type: 'clear', window: 'w2' } })
  })

  it("steps a window's settings through their values, wrapping around", () => {
    const items = windowItems(scene, 'main')
    const theme = find(items, 'theme')
    expect(theme?.kind === 'action' && theme.step?.(1)).toEqual({ type: 'setTheme', window: 'main', theme: 'plasma' })
    expect(theme?.kind === 'action' && theme.step?.(-1)).toEqual({ type: 'setTheme', window: 'main', theme: 'plasma' })
    const route = find(items, 'route')
    expect(route?.kind === 'action' && route.step?.(1)).toEqual({ type: 'setRoute', window: 'main', route: 'card' })
    // main can't be renamed or closed
    expect(find(items, 'name')).toBeUndefined()
    expect(find(items, 'close')).toBeUndefined()
  })

  it('sets switches to the other state, and shows why one is fixed', () => {
    const main = windowItems(scene, 'main')
    expect(find(main, 'visible')).toMatchObject({ on: true, run: { type: 'setVisible', window: 'main', on: false } })
    const top = windowItems(scene, 'w2')
    expect(find(top, 'fill')).toMatchObject({ value: '主题本身就是全屏' })
    const name = find(top, 'name')
    expect(name?.kind === 'action' && name.step?.(1)).toEqual({ type: 'rename', window: 'w2', name: 'left' })
    expect(find(top, 'close')).toMatchObject({ danger: true, run: { type: 'closeWindow', window: 'w2' } })
  })

  it('finds commands and windows by every term, in any order', () => {
    const search = (q: string, s = scene) => keys(searchItems(s, q))
    expect(search('top 风铃')).toEqual(['w2:theme:furin'])
    expect(search('风铃 top')).toEqual(['w2:theme:furin'])
    expect(search('main plasma')).toEqual(['main:theme:plasma'])
    expect(search('显示 top')).toEqual(['w2:visible'])
    expect(search('关闭')).toEqual(['w2:click', 'w2:close'])
    expect(search('top').slice(0, 1)).toEqual(['w:w2'])
    expect(search('暂停')).toEqual(['pause'])
    expect(search('跳过', busy())).toEqual(['w2:skip'])
    expect(searchItems(scene, 'nothing')).toEqual([{ kind: 'note', key: 'note', label: '没有匹配的命令，输入 / 查看全部' }])
  })
})
