// 晨报 · a front page. Design notes: ./README.md.
import type { OnAir } from '@contract'
import { salienceOf } from '@screen/primitives/blocks'
import type { Theme } from '@screen/runtime/theme-api'
import { editionAt } from './parts/masthead'
import { restate, story } from './parts/story'
import { createVerse } from './parts/verse'
import './theme.css'

const STORIES = ['lead', 'col1', 'col2', 'col3'] as const
const LIFT_MS = 500 // matches gz-lift in theme.css

const PAGE = `
<div class="gz-paper">
  <header class="gz-mast">
    <div class="gz-ear gz-ear-l"><b class="gz-issue"></b><span class="gz-weekday"></span></div>
    <h1 class="gz-name">ECHO</h1>
    <div class="gz-ear gz-ear-r"><span class="gz-seal"></span><span class="gz-time"></span></div>
  </header>
  <div class="gz-dateline"><span class="gz-date"></span><span class="gz-house">echo 新聞社</span><span>定価 〇円</span></div>
  <main class="gz-body">
    <section class="gz-slot gz-lead" data-slot="lead"></section>
    <div class="gz-lower">
      <section class="gz-slot gz-col" data-slot="col2"></section>
      <section class="gz-slot gz-col" data-slot="col3"></section>
    </div>
    <aside class="gz-rail">
      <section class="gz-slot gz-col" data-slot="col1"></section>
      <section class="gz-slot gz-verse" data-slot="verse"></section>
    </aside>
    <div class="gz-idle"><span>本日休刊</span><small>次の記事を待っています</small></div>
  </main>
  <div class="gz-stamp">号外</div>
</div>`

export default function createGazette(): Theme {
  let root: HTMLElement | null = null
  let verse: ReturnType<typeof createVerse> | null = null
  let ticker: ReturnType<typeof setInterval> | undefined
  const onPage: Record<string, OnAir | null> = {}

  const slotEl = (slot: string) => root?.querySelector<HTMLElement>(`[data-slot="${slot}"]`) ?? null
  const text = (sel: string, value: string) => {
    const e = root?.querySelector(sel)
    if (e && e.textContent !== value) e.textContent = value
  }

  function masthead(): void {
    const e = editionAt(new Date())
    text('.gz-issue', e.issue)
    text('.gz-weekday', e.weekday)
    text('.gz-seal', e.edition)
    text('.gz-time', `${e.time} 発行`)
    text('.gz-date', `${e.date}\u3000${e.weekday}`)
  }

  /** Which parts of the page have anything on them, and whether any story is news that can't wait. */
  function layout(): void {
    if (!root) return
    const has = (slot: string) => !!onPage[slot]
    const lead = has('lead')
    const rail = ['col1', 'verse'].some(has)
    const lower = ['col2', 'col3'].some(has)
    root.classList.toggle('has-lead', lead)
    root.classList.toggle('has-rail', rail)
    root.classList.toggle('has-lower', lower)
    root.classList.toggle('verse-only', has('verse') && !lead && !lower && !has('col1'))
    root.classList.toggle('is-idle', !lead && !rail && !lower)
    for (const s of ['col1', 'col2', 'col3', 'verse']) slotEl(s)?.classList.toggle('is-empty', !has(s))
    root.classList.toggle('extra', STORIES.some((s) => onPage[s] && salienceOf(onPage[s]!) === 'attention'))
  }

  /** Put a story in its place: printed fresh, or, for the same story, restated in place. */
  function print(slot: string, next: OnAir, fresh: boolean): void {
    const box = slotEl(slot)
    if (!box) return
    const before = onPage[slot]
    onPage[slot] = next
    const current = box.querySelector<HTMLElement>(':scope > .gz-story:not(.gz-leaving)')
    const set = story(next.presentation, salienceOf(next))
    if (!fresh && current && before) {
      current.replaceWith(set)
      restate(set, before.presentation, next.presentation)
    } else {
      if (current) lift(current)
      set.classList.add('gz-print')
      box.append(set)
    }
    layout()
  }

  /** The story going off the page: the ink lifts. */
  function lift(old: HTMLElement): void {
    old.classList.add('gz-leaving')
    setTimeout(() => old.remove(), LIFT_MS)
  }

  return {
    mount(el) {
      root = el
      el.classList.add('gz')
      el.innerHTML = PAGE
      verse = createVerse(slotEl('verse')!)
      masthead()
      ticker = setInterval(masthead, 15_000)
      layout()
    },

    unmount() {
      clearInterval(ticker)
      root?.classList.remove('gz', 'has-lead', 'has-rail', 'has-lower', 'verse-only', 'is-idle', 'extra')
      root = verse = null
    },

    show(slot, next) {
      if (slot === 'verse') {
        onPage.verse = next
        verse?.show(next)
        layout()
      } else print(slot, next, true)
    },
    update(slot, next) {
      if (slot === 'verse') {
        onPage.verse = next
        verse?.show(next)
      } else print(slot, next, false)
    },
    clear(slot) {
      onPage[slot] = null
      if (slot === 'verse') verse?.clear()
      else {
        const current = slotEl(slot)?.querySelector<HTMLElement>(':scope > .gz-story:not(.gz-leaving)')
        if (current) lift(current)
      }
      layout()
    },
    idle() {
      layout()
    },

    frame(clock) {
      verse?.frame(clock.slots.verse?.t)
    },
  }
}
