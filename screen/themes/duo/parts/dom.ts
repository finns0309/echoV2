export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}

const pad = (n: number) => String(n).padStart(2, '0')
export const clock = (d: Date) => `${d.getHours()}:${pad(d.getMinutes())}`
const WEEKDAYS = '日月火水木金土'
export const dateLine = (d: Date) => `${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAYS[d.getDay()]}曜日`
