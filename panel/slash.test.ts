import { describe, expect, it } from 'vitest'
import type { Item } from './commands'
import { shell } from './fixture'
import { slashItems } from './slash'

const picks = (items: Item[]) =>
  items.filter((i) => i.kind === 'action' || i.kind === 'window').map((i) => (i.kind === 'action' ? (i.run ?? i.fill ?? i.value) : `open ${i.window}`))
const note = (items: Item[]) => items.find((i) => i.kind === 'note')?.label
const slash = (input: string, opened: string | null = null) => slashItems(input, shell, opened)

describe('slash commands', () => {
  it('lists every command after /, and narrows by prefix or by the Chinese name', () => {
    expect(picks(slash('/'))).toEqual(['/new ', '/open ', '/theme ', '/route ', '/name ', '/show ', '/hide ', '/click ', '/fill ', '/reset ', '/close '])
    expect(picks(slash('/th'))).toEqual(['/theme '])
    expect(picks(slash('/隐藏'))).toEqual(['/hide '])
    expect(note(slash('/zzz'))).toMatch(/没有以 \/zzz 开头/)
  })

  it('completes a window, then a value, then runs', () => {
    expect(picks(slash('/theme '))).toEqual(['/theme main ', '/theme top '])
    expect(picks(slash('/theme t'))).toEqual(['/theme top '])
    expect(picks(slash('/theme top '))).toEqual([{ type: 'setTheme', window: 'w2', theme: 'furin' }, '当前'])
    expect(picks(slash('/theme top 风'))).toEqual([{ type: 'setTheme', window: 'w2', theme: 'furin' }])
  })

  it('runs as soon as the window is known when nothing else is needed', () => {
    expect(picks(slash('/reset '))).toEqual([
      { type: 'resetWindow', window: 'main' },
      { type: 'resetWindow', window: 'w2' },
    ])
    // /hide only offers windows that are showing; /show the hidden ones
    expect(picks(slash('/hide '))).toEqual([{ type: 'setVisible', window: 'main', on: false }])
    expect(picks(slash('/show '))).toEqual([{ type: 'setVisible', window: 'w2', on: true }])
    // main can't be closed; a full-screen theme can't fill
    expect(picks(slash('/close '))).toEqual([{ type: 'closeWindow', window: 'w2' }])
    expect(picks(slash('/fill '))).toEqual(['/fill main '])
  })

  it('offers the flip first for a switch, and says when a window cannot', () => {
    expect(picks(slash('/click main '))).toEqual([{ type: 'setClickThrough', window: 'main', on: true }, '当前'])
    expect(picks(slash('/click main 关'))).toEqual(['当前'])
    expect(note(slash('/fill top '))).toBe('top 不能铺满屏幕')
    expect(note(slash('/name main '))).toBe('main 不能名字')
  })

  it('takes the window from the settings page, but still finds one typed by name', () => {
    expect(picks(slash('/theme ', 'w2'))).toEqual([{ type: 'setTheme', window: 'w2', theme: 'furin' }, '当前'])
    expect(picks(slash('/theme main ', 'w2'))).toEqual(['当前', { type: 'setTheme', window: 'main', theme: 'plasma' }])
    expect(picks(slash('/hide m', 'w2'))).toEqual([{ type: 'setVisible', window: 'main', on: false }])
  })

  it('adds a window, with a theme if one is given', () => {
    expect(picks(slash('/new '))).toEqual([{ type: 'addWindow' }, { type: 'addWindow', theme: 'furin' }, { type: 'addWindow', theme: 'plasma' }])
    expect(picks(slash('/new 流'))).toEqual([{ type: 'addWindow', theme: 'plasma' }])
  })

  it('opens a window, and explains what it does not understand', () => {
    expect(picks(slash('/open '))).toEqual(['open main', 'open w2'])
    expect(note(slash('/theme nowhere '))).toBe('没有叫 nowhere 的窗口')
    expect(note(slash('/wat '))).toMatch(/没有 \/wat 这个命令/)
    expect(note(slash('/reset top extra '))).toMatch(/用法/)
  })
})
