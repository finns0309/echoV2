// 新世纪's director grammar: which template each card gets, where it breaks,
// which few cards earn the white card, and which word goes red. One call does
// what the old version needed two for (keyword + eva). Pure: the display
// server loads this file.
import { z } from 'zod'
import type { Grammar, Presentation } from '@contract'

export const DIRECTED_TEMPLATES = ['whisper', 'stack', 'vert', 'corner', 'dual', 'giant', 'bleed'] as const
const MAX_INVERTED = 3
const MAX_BLOCKS = 200

export const CardDirection = z.object({
  tpl: z.enum(DIRECTED_TEMPLATES).optional(),
  inv: z.boolean().optional(),
  brk: z.array(z.string().min(1)).optional(),
  kw: z.string().min(1).optional(),
})
export type CardDirection = z.infer<typeof CardDirection>

export const EvaDirections = z.object({ cards: z.array(CardDirection.nullable()) })
export type EvaDirections = z.infer<typeof EvaDirections>

/** Read OnAir.directions safely; anything malformed reads as "no directions". */
export function directionsOf(value: unknown): EvaDirections | null {
  const parsed = EvaDirections.safeParse(value)
  return parsed.success ? parsed.data : null
}

const INSTRUCTIONS = `你是「新世纪福音战士」式标题字卡的排版导演。舞台是纯黑画面，每一段文字硬切成一张极粗明朝体字卡，没有任何别的元素。给你一段要依次显示的文字（可能是一首歌的整份歌词，也可能是一张卡片上的几行字），你为每一段选排版，让字卡的轻重跟着内容走：有小才显得出大。

每行一条指令：
  <行号> <模板> [inv] [/断点]... [.强调词]

模板：
  whisper  小字居中，四周全黑。安静、念白、过渡、铺垫。它是"轻"，要常用。
  stack    大字横排铺满，自动分行。叙述的默认选择。
  vert     竖排。短而有诗意的中日文（≤12字）；英文禁用。
  corner   直角组版：前半横排大字，后半竖排垂在右侧。需要能分成前后两半，后半≤10字且不是英文。最有"标题感"，留给有转折或对仗的句子。
  dual     对角：前半左上，后半右下。两半有对立、呼应、问答关系时用。
  giant    只把强调词放到最大，整句缩成注脚。留给一个词就能扛起整句的时刻。
  bleed    满版：整句撑满画面。只能用于极短句（中日文≤5字，英文≤2个短词）。

inv（可省）：白底黑字的反转卡。全部内容里最多 3 张，只给最重的时刻。
/断点（可省）：写"后一段开头的 2–6 个字"，必须逐字取自原句，程序在那里断开。原句里本来有空格的地方通常就是好断点，不用再写。不确定就别写。
.强调词（可省）：这一段情感与画面的核心，会被标红。必须逐字取自原句，是完整的词（日语动词带送り仮名，比如「巡り合う」而不是「合」），不要选助词、虚词。

原则：
- 如果是歌词，先在心里分段（主歌 / 预副歌 / 副歌 / 桥段），副歌整体比主歌重。如果是一张卡片，第一行通常是主角。
- whisper 和 stack 是底色，corner / dual / giant / bleed 是重音，重音合计别超过三分之一。
- 内容完全相同的段落必须给相同的指令。
- 每一行都要有指令。只输出指令，不解释，不加 markdown 围栏。`

function textBlocks(p: Presentation): { index: number; text: string; at?: number }[] {
  return p.blocks
    .map((b, index) => (b.type === 'text' ? { index, text: b.text.trim(), ...(b.at === undefined ? {} : { at: b.at }) } : null))
    .filter((b): b is { index: number; text: string; at?: number } => !!b && !!b.text)
    .slice(0, MAX_BLOCKS)
}

const fmtTime = (t: number) => {
  const s = Math.max(0, Math.floor(t))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

function parseLine(rest: string, text: string): CardDirection {
  let body = rest
  let kw: string | undefined
  const kwMatch = body.match(/\s\.(\S.*?)\s*$/)
  if (kwMatch) {
    const candidate = kwMatch[1]!.trim()
    if (text.includes(candidate)) kw = candidate
    body = body.slice(0, kwMatch.index)
  }
  const brk = [...body.matchAll(/\/\s*([^/\s][^/]*?)(?=\s*\/|\s*$)/g)].map((m) => m[1]!.trim()).filter((b) => b && text.indexOf(b) > 0)
  const inv = /(^|\s)inv(\s|$)/.test(body.replace(/\/.*$/, ''))
  return { ...(brk.length ? { brk } : {}), ...(inv ? { inv } : {}), ...(kw ? { kw } : {}) }
}

export const grammar: Grammar = {
  version: 1,
  instructions: INSTRUCTIONS,

  prepare(p) {
    const blocks = textBlocks(p)
    if (!blocks.length) return null
    const header = [p.context.title, p.context.byline].filter(Boolean).join(' — ')
    const lines = blocks.map((b, i) => `${i} ${b.at === undefined ? '' : `${fmtTime(b.at)} `}${b.text}`)
    return {
      input: (header ? `《${header}》\n` : '') + lines.join('\n'),
      key: blocks.map((b) => b.text).join('\n'),
    }
  },

  parse(output, p) {
    const blocks = textBlocks(p)
    const byText = new Map<string, CardDirection>()
    const perLine = new Map<number, CardDirection>()
    let inverted = 0
    for (const raw of output.replace(/```[a-zA-Z]*/g, '').split('\n')) {
      const m = raw.trim().match(/^(\d+)\s+([a-z]+)(.*)$/)
      if (!m) continue
      const block = blocks[Number(m[1])]
      const tpl = m[2] as CardDirection['tpl']
      if (!block || !(DIRECTED_TEMPLATES as readonly string[]).includes(tpl!) || perLine.has(Number(m[1]))) continue
      // Identical text gets identical direction: visual rhyme.
      const earlier = byText.get(block.text)
      if (earlier) {
        perLine.set(Number(m[1]), earlier)
        continue
      }
      const d: CardDirection = { tpl, ...parseLine(m[3] ?? '', block.text) }
      if (d.inv) {
        if (inverted >= MAX_INVERTED) delete d.inv
        else inverted++
      }
      byText.set(block.text, d)
      perLine.set(Number(m[1]), d)
    }
    if (!perLine.size) return null
    const cards: (CardDirection | null)[] = p.blocks.map(() => null)
    blocks.forEach((b, i) => {
      cards[b.index] = perLine.get(i) ?? byText.get(b.text) ?? null
    })
    return { cards } satisfies EvaDirections
  },
}

export default grammar
