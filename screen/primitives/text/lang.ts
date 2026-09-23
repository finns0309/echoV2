// Which language a piece of text is in, as far as typesetting cares. Chinese and
// Japanese share Han codepoints but draw many of them differently (骨, 直, 今):
// the same character needs a Japanese font in a Japanese line. Kana decides it.
import type { Block } from '@contract'

export type Lang = 'ja' | 'zh' | 'ko'

/** ja if there is any kana, ko for hangul, zh for Han alone; undefined for latin and the rest. */
export function detectLang(text: string): Lang | undefined {
  if (/[぀-ヿㇰ-ㇿｦ-ﾟ]/.test(text)) return 'ja'
  if (/[가-힯ᄀ-ᇿ]/.test(text)) return 'ko'
  if (/\p{Script=Han}/u.test(text)) return 'zh'
  return undefined
}

/** A block's language: what it declares, else what its text says. */
export function langOf(block: Block): string | undefined {
  if (block.type === 'text') return block.lang ?? detectLang(block.text + (block.reading ?? ''))
  if (block.type === 'image') return detectLang(block.alt ?? '')
  return detectLang(block.label ?? '')
}

/** Set (or clear) an element's lang, which the themes' :lang() font stacks key off. */
export function setLang(el: HTMLElement, lang: string | undefined): void {
  if (lang) el.lang = lang
  else el.removeAttribute('lang')
}
