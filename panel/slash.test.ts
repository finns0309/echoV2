import { describe, expect, it } from 'vitest'
import type { Item } from './commands'
import { busy, scene } from './fixture'
import { slashItems } from './slash'

const picks = (items: Item[]) =>
  items.filter((i) => i.kind === 'action' || i.kind === 'window').map((i) => (i.kind === 'action' ? (i.run ?? i.fill ?? i.value) : `open ${i.window}`))
const note = (items: Item[]) => items.find((i) => i.kind === 'note')?.label
const slash = (input: string, opened: string | null = null, s = scene) => slashItems(input, s, opened)

describe('slash commands', () => {
  it('lists every command after /, and narrows by prefix or by the Chinese name', () => {
    expect(picks(slash('/'))).toEqual(['/new ', '/open ', '/theme ', '/route ', '/loud ', '/skip ', '/clear ', '/name ', '/show ', '/hide ', '/click ', '/fill ', '/reset ', '/close ', '/pause ', '/resume '])
    expect(picks(slash('/th'))).toEqual(['/theme '])
    expect(picks(slash('/隐藏'))).toEqual(['/hide '])
    expect(note(slash('/zzz'))).toMatch(/没有以 \/zzz 开头/)
  })

  it('completes a window, then a value, then runs', () => {
    expect(picks(slash('/theme '))).toEqual(['/theme main ', '/theme top ', '/theme 全部 '])
    expect(picks(slash('/theme t'))).toEqual(['/theme top '])
    expect(picks(slash('/theme top '))).toEqual([{ type: 'setTheme', window: 'w2', theme: 'furin' }, '当前'])
    expect(picks(slash('/theme top 风'))).toEqual([{ type: 'setTheme', window: 'w2', theme: 'furin' }])
  })

  it('runs as soon as the window is known when nothing else is needed', () => {
    expect(picks(slash('/reset '))).toEqual([
      { type: 'resetWindow', window: 'main' },
      { type: 'resetWindow', window: 'w2' },
      [
        { type: 'resetWindow', window: 'main' },
        { type: 'resetWindow', window: 'w2' },
      ],
    ])
    // /hide only offers windows that are showing; /show the hidden ones
    expect(picks(slash('/hide '))).toEqual([{ type: 'setVisible', window: 'main', on: false }])
    expect(picks(slash('/show '))).toEqual([{ type: 'setVisible', window: 'w2', on: true }])
    // main can't be closed; a full-screen theme can't fill
    expect(picks(slash('/close '))).toEqual([{ type: 'closeWindow', window: 'w2' }])
    expect(picks(slash('/fill '))).toEqual(['/fill main '])
  })

  it('caps how loud a window may look', () => {
    expect(picks(slash('/loud top '))).toEqual(['当前', { type: 'setLoudness', window: 'w2', loudness: 'normal' }, { type: 'setLoudness', window: 'w2', loudness: 'quiet' }])
    expect(picks(slash('/loud top 安'))).toEqual([{ type: 'setLoudness', window: 'w2', loudness: 'quiet' }])
    expect(picks(slash('/醒目'))).toEqual(['/loud '])
  })

  it('does it to every window with 全部, where that makes sense', () => {
    // a value: set on the windows that don't have it yet
    expect(picks(slash('/loud 全部 '))).toEqual(['都是', [{ type: 'setLoudness', window: 'main', loudness: 'normal' }, { type: 'setLoudness', window: 'w2', loudness: 'normal' }], expect.any(Array)])
    expect(picks(slash('/theme all 风铃'))).toEqual([[{ type: 'setTheme', window: 'w2', theme: 'furin' }]])
    // a switch spelled as a word runs at once, on the windows it would change
    expect(picks(slash('/hide ', null, busy()))).toEqual([
      { type: 'setVisible', window: 'main', on: false },
      { type: 'setVisible', window: 'w2', on: false },
      [
        { type: 'setVisible', window: 'main', on: false },
        { type: 'setVisible', window: 'w2', on: false },
      ],
    ])
    // names are unique and closing everything is too much
    expect(note(slash('/close 全部 '))).toMatch(/一次只能对一个窗口/)
    expect(picks(slash('/close '))).toEqual([{ type: 'closeWindow', window: 'w2' }])
  })

  it('skips and clears cards, but leaves a song to its player', () => {
    expect(note(slash('/skip '))).toMatch(/没有窗口可以跳过当前/)
    expect(picks(slash('/skip ', null, busy()))).toEqual([{ type: 'skip', window: 'w2' }])
    // clearing "all" also takes what is waiting in line
    expect(picks(slash('/clear ', null, busy()))).toEqual([{ type: 'clear', window: 'w2' }, { type: 'clear' }])
  })

  it('pauses and resumes the rotation', () => {
    expect(picks(slash('/pause '))).toEqual([{ type: 'setPaused', on: true }])
    expect(note(slash('/pause ', null, busy(true)))).toMatch(/已经暂停/)
    expect(picks(slash('/resume ', null, busy(true)))).toEqual([{ type: 'setPaused', on: false }])
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
