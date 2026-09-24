#!/usr/bin/env node
// Things for the mochi to say, found by an agent, from outside echo. It asks codex
// (headless, read-only, the user's own ChatGPT login, web search on) to look for
// what's worth a glance today, checks what it wrote, and sends the batch to echo's
// agent API like any other agent. echo only displays; nothing here is part of it.
// A stand-in until there is a proper producer of its own.
//
//   node scripts/mochi-feed.mjs          search, write, send
//   node scripts/mochi-feed.mjs --dry    search and write, print the cards, send nothing
//   --model <slug>                       the agent (default gpt-5.6-luna)
//   --window <name>                      where to send (default top)
//
// The search runs on OpenAI's side (a hosted tool), which codex only offers
// through its own provider, so this uses the codex login rather than a relay.
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const WINDOW = arg('--window') ?? 'top'
const MODEL = arg('--model') ?? 'gpt-5.6-luna'
const DRY = process.argv.includes('--dry')
const GROUP = 'mochi-feed'
const TTL_S = 6 * 3600

const API = process.env.ECHO_API ?? 'http://127.0.0.1:10757'
const TOKEN = join(homedir(), 'Library/Application Support/echo-v2/agent-token')
const STATE = join(homedir(), '.local/state/echo-feed')
const SHOWN = join(STATE, 'shown.json') // what it has said lately, so it looks for something else

function arg(name) {
  const i = process.argv.indexOf(name)
  return i > 0 ? process.argv[i + 1] : undefined
}
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]))

// — The brief —

const brief = (today, shown) => `あなたは「もち」という小さなデスクトップペットの編集者です。今日は ${today}。
読者は中国語が母語で、日本語を勉強中（だいたい N3）。もちは画面の下で、吹き出しで話します。
読者が気になっていること: 日本語の勉強、日本の文化や季節、旅行（日本、トルコなど）、科学と宇宙、テクノロジー。

web search で、ちらっと見て「へえ」と思えるものを探してください。ここ数日のニュースでも、季節の話題や文化の豆知識でもいい。
いくつかの違う方向から検索して、一つのサイトや話題にかたよらないように。
その中から、ニュースや豆知識のカードを5枚、そこに出てくる語から覚える価値のある単語を2〜3枚作ってください。

門番として:
- 見て少し楽しくなる、または知っておくと役に立つもの。死者数や事件・事故の生々しい話、犯罪、ゴシップ、煽る話は選ばない。
- 事実は、実際に開いて読んだページに書いてあることだけ。数字や名前を変えない、足さない。推測で書かない。
- source にはそのページの URL を入れる。確かめられなかったものはカードにしない。
- 最近もちが話したこと（下のリスト）と同じ話題は避ける。

書き方:
- やさしい日本語、くだけた口調（〜だって、〜みたい、〜だよ）。1行は28文字まで、1枚2〜3行。
- title は短いラベル（8文字まで）: 「ニュース」「きせつ」「たびのはなし」「うちゅう」など。単語は「きょうのことば」。
- emphasis はその行の中にそのまま出てくる語だけ。
- 単語カード: 見出しは漢字かかなだけで1〜4文字、reading はひらがな。2行目にやさしい日本語で意味、3行目に「中文：」で中国語の意味（role は annotation）。

最近もちが話したこと:
${shown.length ? shown.map((s) => `- ${s}`).join('\n') : '（まだない）'}`

// Strict structured output: every field required, the optional ones nullable.
const LINE = {
  type: 'object',
  additionalProperties: false,
  required: ['text', 'role', 'reading', 'emphasis'],
  properties: {
    text: { type: 'string' },
    role: { type: 'string', enum: ['primary', 'secondary', 'annotation'] },
    reading: { type: ['string', 'null'] },
    emphasis: { type: ['string', 'null'] },
  },
}
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['cards'],
  properties: {
    cards: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'title', 'lines', 'source'],
        properties: {
          kind: { type: 'string', enum: ['news', 'fact', 'word'] },
          title: { type: 'string' },
          lines: { type: 'array', items: LINE },
          source: { type: 'string', description: '読んだページの URL' },
        },
      },
    },
  },
}

function agent(prompt) {
  const schema = join(STATE, 'schema.json')
  const answer = join(STATE, 'answer.json')
  writeFileSync(schema, JSON.stringify(SCHEMA))
  rmSync(answer, { force: true })
  return new Promise((resolve, reject) => {
    // Read-only, no user config (no hooks, skills or AGENTS.md), nothing kept, and a
    // clean environment: it searches and writes, and can't touch anything here.
    const child = spawn(
      'codex',
      ['exec', '-m', MODEL, '--skip-git-repo-check', '--ephemeral', '--ignore-user-config', '--ignore-rules', '-s', 'read-only', '-c', 'web_search=live', '--output-schema', schema, '-o', answer, '-'],
      { cwd: STATE, stdio: ['pipe', 'ignore', 'pipe'], env: pick(process.env, ['HOME', 'PATH', 'USER', 'LANG', 'TMPDIR', 'SHELL']) },
    )
    let log = ''
    child.stderr.on('data', (d) => (log += d))
    child.on('error', reject)
    child.on('close', (code) => {
      const searches = log.split('\n').filter((l) => l.startsWith('web search: ') && l.length > 13)
      for (const s of searches) console.log(`  ${s.slice(0, 100)}`)
      try {
        resolve(JSON.parse(readFileSync(answer, 'utf8')))
      } catch {
        const why = log.split('\n').filter((l) => /ERROR/.test(l) && !/models_manager/.test(l)).slice(-2).join('\n')
        reject(new Error(`the agent gave no answer (codex exited ${code})\n${why.slice(0, 400)}`))
      }
    })
    child.stdin.end(prompt)
  })
}

// — Checking what it wrote, and timing it —

const WRITABLE = /^[ぁ-ヿ㐀-䶿一-鿿々]{1,4}$/u // what the mochi can write out (see its strokes.ts)
const MAX_LINE = 34
const PER_SITE = 2 // stories from any one site; the brief asks for variety, this makes sure

/** At most PER_SITE stories from one site (words come from the stories, so they don't count). */
function varied(cards) {
  const count = new Map()
  return cards.filter((c) => {
    if (c.kind === 'word') return true
    const host = new URL(c.source).host
    count.set(host, (count.get(host) ?? 0) + 1)
    return count.get(host) <= PER_SITE
  })
}

function fit(card) {
  if (!/^https?:\/\//.test(card.source)) return null // nothing it couldn't point to
  const lines = card.lines.filter((l) => l.text.length <= MAX_LINE || l.role === 'annotation').map((l) => {
    const line = { text: l.text, role: l.role }
    if (l.emphasis && l.text.includes(l.emphasis)) line.emphasis = l.emphasis
    if (l.reading && l.role === 'primary') line.reading = l.reading
    return line
  })
  if (lines[0]?.role !== 'primary') return null
  if (card.kind === 'word' && !(WRITABLE.test(lines[0].text) && lines[0].reading)) return null
  // Each line comes after the one before has had time to be read.
  let at = 0
  for (const l of lines) {
    l.at = Math.round(at * 10) / 10
    at += Math.max(3, l.text.length * 0.2)
  }
  const writing = card.kind === 'word' ? [...lines[0].text].length * 7 : 0
  return { ...card, title: card.title.slice(0, 12), lines, dwell: Math.round(Math.max(at + 4, writing + 8)) }
}

// — Sending —

async function echo(method, path, body) {
  const token = readFileSync(TOKEN, 'utf8').trim()
  const res = await fetch(API + path, {
    method,
    headers: { 'x-echo-token': token, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`echo ${method} ${path}: ${res.status} ${text}`)
  return text ? JSON.parse(text) : null
}

// — The run —

mkdirSync(STATE, { recursive: true })
let shown = []
try {
  shown = JSON.parse(readFileSync(SHOWN, 'utf8'))
} catch {
  // first run
}

const today = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
console.log(`looking for things (${MODEL})…`)
const { cards } = await agent(brief(today, shown))
const ready = varied(cards.map(fit).filter(Boolean))
for (const c of ready) console.log(`  ${c.kind.padEnd(4)} ${c.title}: ${c.lines.map((l) => l.text).join(' / ')}\n       ${c.source}`)
if (cards.length > ready.length) console.log(`  (${cards.length - ready.length} card(s) didn't pass and were dropped)`)

if (!DRY && ready.length) {
  await echo('DELETE', `/contents?group=${GROUP}`)
  const stamp = new Date().toISOString().slice(0, 13).replace(/\D/g, '')
  for (const [i, c] of ready.entries()) {
    await echo('POST', '/contents', {
      id: `${GROUP}-${stamp}-${i}`,
      kind: c.kind,
      title: c.title,
      lines: c.lines,
      window: WINDOW,
      group: GROUP,
      repeat: true,
      salience: 'normal',
      dwellSeconds: c.dwell,
      ttlSeconds: TTL_S,
    })
  }
  console.log(`sent ${ready.length} cards to ${WINDOW}`)
  writeFileSync(SHOWN, JSON.stringify([...shown, ...ready.map((c) => `${c.title}: ${c.lines[0].text}`)].slice(-60), null, 1))
}
