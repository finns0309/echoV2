#!/usr/bin/env node
// A small feed for the mochi, from outside echo: it reads a few news feeds, asks
// an editor model (codex, headless, read-only, no user config) to choose and
// rewrite, and sends what passes to echo's agent API like any other agent. echo
// only displays; nothing here is part of it. A stand-in until there is a proper
// producer of its own.
//
//   node scripts/nhk-feed.mjs          fetch, edit, send
//   node scripts/nhk-feed.mjs --dry    fetch and edit, print the cards, send nothing
//   node scripts/nhk-feed.mjs --ask    only fetch, and print what the editor would be given
//   --model <slug>                     the editor (default gpt-5.6-luna)
//
// Sources: NHK ONE ニュース RSS (fresh, ordinary Japanese) and MATCHA やさしい日本語
// (travel and culture, already easy, not updated often). NHK's own やさしいことば
// ニュース sits behind NHK ONE's terms and a login token, so it isn't used.
//
// The editor goes through an OpenAI-compatible relay; its key is read from
// $ECHO_FEED_KEY, else ~/.local/state/echo-feed/key (owner-only), and is never logged.
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const WINDOW = arg('--window') ?? 'top'
const GROUP = 'nhk-feed'
const DRY = process.argv.includes('--dry')
const TTL_S = 6 * 3600 // a batch lasts until about when the next one would come
const MODEL = arg('--model') ?? 'gpt-5.6-luna'
const RELAY = 'https://sub2api.pexoai.cn'
const ASK = process.argv.includes('--ask') // print what the editor would be asked, and stop

const NHK = ['cat0', 'cat2', 'cat3', 'cat6', 'cat7'].map((c) => `https://news.web.nhk/n-data/conf/na/rss/${c}.xml`)
const MATCHA = 'https://matcha-jp.com/easy/feed'
const API = process.env.ECHO_API ?? 'http://127.0.0.1:10757'
const TOKEN = join(homedir(), 'Library/Application Support/echo-v2/agent-token')
const STATE = join(homedir(), '.local/state/echo-feed')
const SEEN = join(STATE, 'seen.json')
const KEY = join(STATE, 'key')

const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]))

function arg(name) {
  const i = process.argv.indexOf(name)
  return i > 0 ? process.argv[i + 1] : undefined
}

// — Reading the feeds —

const decode = (s) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')
// <ruby>漢字<rt>かんじ</rt></ruby> → 漢字(かんじ), then drop any other tags
const plain = (s) => decode(s).replace(/<ruby>([^<]*)<rt>([^<]*)<\/rt><\/ruby>/g, '$1($2)').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
const field = (item, tag) => plain(item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1] ?? '')

async function feed(url) {
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } })
    if (!res.ok) throw new Error(`${res.status}`)
    const xml = await res.text()
    return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, x]) => ({
      title: field(x, 'title'),
      summary: field(x, 'description').slice(0, 160),
      link: field(x, 'link'),
      date: field(x, 'pubDate'),
    }))
  } catch (err) {
    console.warn(`skip ${url}: ${err.message}`)
    return []
  }
}

// — The editor —

const BRIEF = `あなたは「もち」という小さなデスクトップペットの編集者です。
読者は中国語が母語で、日本語を勉強中（だいたい N3）。もちは画面の下で、吹き出しで話します。

ニュースの候補から、ちらっと見る価値があるものを最大4つ選び、もちのことばに書き直してください。
それとは別に、旅行・文化の記事から1つ選んで紹介し、ニュースに出てくる語から覚える価値のある単語を2〜3個選んでください。

選ぶ基準（門番として）:
- 見て少し楽しくなる、または知っておくと役に立つもの。科学・文化・くらし・スポーツ・大きな国際ニュースを優先。
- 死者数や事件・事故の生々しい話、犯罪、ゴシップ、煽るような話は選ばない。災害は、役に立つ注意として一言にできる場合だけ、多くても1つ。
- 同じ話題の重複は1つにまとめる。
- 選ばなかった主なものは skipped に理由を短く。

書き方:
- やさしい日本語、くだけた口調（〜だって、〜みたい、〜だよ）。1行は28文字まで、1枚2〜3行。
- 事実は候補の本文にあることだけ。数字や名前を変えない、足さない。
- emphasis はその行の中にそのまま出てくる語だけ。
- 単語カード: 見出しは漢字かかなだけで1〜4文字、reading はひらがな。2行目にやさしい日本語で意味、3行目に「中文：」で中国語の意味（role は annotation）。例文を入れるならニュースから。
- 旅行カードは title を「たびのはなし」に。ニュースは「ニュース」、単語は「きょうのことば」。`

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
  required: ['cards', 'skipped'],
  properties: {
    cards: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'title', 'lines', 'source'],
        properties: {
          kind: { type: 'string', enum: ['news', 'word', 'travel'] },
          title: { type: 'string' },
          lines: { type: 'array', items: LINE },
          source: { type: 'string', description: 'どの候補から（link）' },
        },
      },
    },
    skipped: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['title', 'why'], properties: { title: { type: 'string' }, why: { type: 'string' } } } },
  },
}

function edit(news, travel) {
  const prompt = `${BRIEF}\n\n## ニュースの候補\n${JSON.stringify(news, null, 1)}\n\n## 旅行・文化の候補\n${JSON.stringify(travel, null, 1)}`
  const schema = join(STATE, 'schema.json')
  const answer = join(STATE, 'answer.json')
  writeFileSync(schema, JSON.stringify(SCHEMA))
  rmSync(answer, { force: true })
  const key = process.env.ECHO_FEED_KEY ?? readFileSync(KEY, 'utf8').trim()
  const relay = ['model_provider=relay', 'model_providers.relay.name=relay', `model_providers.relay.base_url=${RELAY}`, 'model_providers.relay.wire_api=responses', 'model_providers.relay.env_key=ECHO_FEED_KEY']
  return new Promise((resolve, reject) => {
    // Read-only, no user config (no hooks, skills or AGENTS.md), nothing kept: it
    // only reads the candidates and writes cards. A clean environment, so a parent
    // session's variables can't stand in for the relay's.
    const child = spawn(
      'codex',
      ['exec', '-m', MODEL, '--skip-git-repo-check', '--ephemeral', '--ignore-user-config', '--ignore-rules', '-s', 'read-only', ...relay.flatMap((c) => ['-c', c]), '--output-schema', schema, '-o', answer, '-'],
      { cwd: STATE, stdio: ['pipe', 'ignore', 'pipe'], env: { ...pick(process.env, ['HOME', 'PATH', 'USER', 'LANG', 'TMPDIR', 'SHELL']), ECHO_FEED_KEY: key } },
    )
    let log = ''
    child.stderr.on('data', (d) => (log += d))
    child.on('error', reject)
    child.on('close', (code) => {
      try {
        resolve(JSON.parse(readFileSync(answer, 'utf8')))
      } catch {
        const why = log.split('\n').filter((l) => /ERROR/.test(l) && !/models_manager/.test(l)).slice(-2).join('\n')
        reject(new Error(`the editor gave no answer (codex exited ${code})\n${why.slice(0, 400)}`))
      }
    })
    child.stdin.end(prompt)
  })
}

// — Checking what the editor wrote, and timing it —

const WRITABLE = /^[ぁ-ヿ㐀-䶿一-鿿々]{1,4}$/u // what the mochi can write out (see its strokes.ts)
const MAX_LINE = 34

function fit(card) {
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
  return { ...card, lines, dwell: Math.round(Math.max(at + 4, writing + 8)) }
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
let seen = []
try {
  seen = JSON.parse(readFileSync(SEEN, 'utf8'))
} catch {
  // first run
}

const byLink = new Map()
for (const item of (await Promise.all(NHK.map(feed))).flat()) if (item.link && !seen.includes(item.link)) byLink.set(item.link, item)
// The newest few dozen, one per headline: enough to choose from, not a whole day's paper.
const titles = new Set()
const news = [...byLink.values()]
  .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
  .filter((n) => !titles.has(n.title) && titles.add(n.title))
  .slice(0, 30)
const travel = (await feed(MATCHA)).sort(() => Math.random() - 0.5).slice(0, 5)
console.log(`${news.length} new stories, ${travel.length} travel pieces to choose from`)
if (!news.length && !travel.length) process.exit(0)

if (ASK) {
  console.log(JSON.stringify({ news, travel }, null, 1))
  process.exit(0)
}
const { cards, skipped } = await edit(news, travel)
const ready = cards.map(fit).filter(Boolean)
for (const s of skipped) console.log(`  skipped: ${s.title} (${s.why})`)
for (const c of ready) console.log(`  ${c.kind.padEnd(6)} ${c.lines.map((l) => l.text).join(' / ')}`)
if (cards.length > ready.length) console.log(`  (${cards.length - ready.length} card(s) didn't fit and were dropped)`)

if (!DRY) {
  await echo('DELETE', `/contents?group=${GROUP}`)
  const stamp = new Date().toISOString().slice(0, 13).replace(/\D/g, '')
  for (const [i, c] of ready.entries()) {
    await echo('POST', '/contents', {
      id: `${GROUP}-${stamp}-${i}`,
      kind: c.kind === 'travel' ? 'fact' : c.kind,
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
  // Remember every story offered, chosen or not, so the next run only sees what's new.
  writeFileSync(SEEN, JSON.stringify([...seen, ...news.map((n) => n.link)].slice(-500)))
}
