// What the mochi is made of today: the wagashi of the season, by the calendar.
// Only its colours and a garnish change; its shape and habits stay. Pure.

export type Garnish = 'none' | 'leaf' | 'oak' | 'dust' | 'chestnut' | 'berry'

export interface Flavor {
  id: string
  /** Its name, as a shop would write it. */
  name: string
  /** The body: light at the top-left, darker at the rim. */
  fill: [string, string, string]
  stroke: string
  eyes: string
  cheeks: string
  garnish: Garnish
  /** See-through, for the summer ones. */
  clear?: boolean
}

const WHITE: Omit<Flavor, 'id' | 'name' | 'garnish'> = { fill: ['#fffefb', '#fbf5ec', '#efe4d4'], stroke: '#e6dccd', eyes: '#3a302b', cheeks: '#f6b9b3' }

const FLAVORS: Record<string, Flavor> = {
  shiro: { id: 'shiro', name: 'つきたて', ...WHITE, garnish: 'none' },
  uguisu: { id: 'uguisu', name: 'うぐいす餅', fill: ['#eef0c4', '#d9e09a', '#b7c36f'], stroke: '#aab562', eyes: '#39401f', cheeks: '#f3b3a8', garnish: 'dust' },
  sakura: { id: 'sakura', name: '桜餅', fill: ['#fde8ec', '#f6c6cf', '#e9a2b0'], stroke: '#de98a6', eyes: '#4a2e33', cheeks: '#ee8f9f', garnish: 'leaf' },
  kusa: { id: 'kusa', name: '草餅', fill: ['#cfe0b3', '#a9c486', '#86a563'], stroke: '#7f9c5d', eyes: '#2c3820', cheeks: '#e9a9a0', garnish: 'none' },
  kashiwa: { id: 'kashiwa', name: '柏餅', ...WHITE, garnish: 'oak' },
  mizu: { id: 'mizu', name: '水信玄餅', fill: ['#ffffff', '#eaf4fb', '#cfe3f0'], stroke: '#b9d3e4', eyes: '#2f3c47', cheeks: '#f6c0bb', garnish: 'none', clear: true },
  tsukimi: { id: 'tsukimi', name: 'お月見団子', ...WHITE, garnish: 'none' },
  ohagi: { id: 'ohagi', name: 'おはぎ', fill: ['#7a5560', '#5f3f48', '#472d35'], stroke: '#3e262d', eyes: '#f4e6de', cheeks: '#c77f8a', garnish: 'none' },
  kinako: { id: 'kinako', name: 'きなこ餅', fill: ['#f3dfa8', '#e5c47b', '#c9a352'], stroke: '#b89245', eyes: '#4a3a1c', cheeks: '#eba493', garnish: 'dust' },
  kuri: { id: 'kuri', name: '栗餅', fill: ['#fbeec5', '#f2d98e', '#dcb862'], stroke: '#caa655', eyes: '#4a3a1c', cheeks: '#eea596', garnish: 'chestnut' },
  ichigo: { id: 'ichigo', name: 'いちご大福', ...WHITE, garnish: 'berry' },
}

/** [from, to] as month*100 + day, both inclusive; the first that matches wins. */
const CALENDAR: [number, number, string][] = [
  [501, 507, 'kashiwa'], // Children's Day
  [919, 927, 'ohagi'], // autumn higan, around the equinox
  [101, 131, 'shiro'],
  [201, 229, 'uguisu'],
  [301, 410, 'sakura'],
  [411, 531, 'kusa'],
  [601, 831, 'mizu'],
  [901, 918, 'tsukimi'],
  [928, 1115, 'kinako'],
  [1116, 1130, 'kuri'],
  [1201, 1231, 'ichigo'],
]

/** The calendar's pick for a day, if it has one. */
export function seasonOf(d: Date): string | undefined {
  const md = (d.getMonth() + 1) * 100 + d.getDate()
  return CALENDAR.find(([from, to]) => md >= from && md <= to)?.[2]
}

export const flavorFor = (d: Date): Flavor => FLAVORS[seasonOf(d) ?? 'shiro']!
