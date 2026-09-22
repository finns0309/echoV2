// Composition root for the stdio MCP adapter. Claude Code spawns this process.
// It only forwards tool calls to the display server's agent HTTP API.
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { AgentCardInput } from '@contract'

const API = process.env.ECHO_API ?? 'http://127.0.0.1:10757'
// The display server writes this file on first launch (Electron userData for "echo-v2").
const TOKEN_PATH = join(homedir(), 'Library/Application Support/echo-v2/agent-token')

function token(): string {
  if (process.env.ECHO_TOKEN) return process.env.ECHO_TOKEN
  try {
    return readFileSync(TOKEN_PATH, 'utf8').trim()
  } catch {
    throw new Error(`no token at ${TOKEN_PATH}; start echo once so it creates one`)
  }
}

async function call(method: string, path: string, body?: unknown): Promise<unknown> {
  let res: Response
  try {
    res = await fetch(API + path, {
      method,
      headers: { 'x-echo-token': token(), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new Error(`echo is not reachable at ${API}. Is echo running?`)
  }
  const text = await res.text()
  const data: unknown = text ? JSON.parse(text) : null
  if (!res.ok) throw new Error((data as { error?: string } | null)?.error ?? `echo answered ${res.status}`)
  return data
}

const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] })
const failure = (err: unknown) => ({ ...text(err instanceof Error ? err.message : String(err)), isError: true })

const server = new McpServer({ name: 'echo', version: '0.1.0' })

server.registerTool(
  'show',
  {
    title: 'Show on echo',
    description: [
      'Put a card on echo, the always-on-top display on the user\'s desktop.',
      'Use it for things worth a glance: a word or fact to remember, a short message, a status that changed.',
      'Keep cards short (a few lines). Lines appear one after another. Do not send many cards in a row;',
      'echo queues them and shows one at a time. Reuse the same id to update a card instead of adding a new one.',
    ].join(' '),
    inputSchema: AgentCardInput.shape,
  },
  async (input) => {
    try {
      const { id } = (await call('POST', '/contents', input)) as { id: string }
      return text(`Queued on echo as ${id}.`)
    } catch (err) {
      return failure(err)
    }
  },
)

server.registerTool(
  'status',
  {
    title: 'echo status',
    description: 'What echo is showing right now, and what is still waiting in line.',
    inputSchema: {},
  },
  async () => {
    try {
      const [stage, queued] = await Promise.all([call('GET', '/stage'), call('GET', '/contents')])
      return text(JSON.stringify({ stage, queued }, null, 2))
    } catch (err) {
      return failure(err)
    }
  },
)

server.registerTool(
  'clear',
  {
    title: 'Remove from echo',
    description: 'Take a card off echo (or out of the queue) by the id `show` returned.',
    inputSchema: { id: z.string().min(1) },
  },
  async ({ id }) => {
    try {
      await call('DELETE', `/contents/${encodeURIComponent(id)}`)
      return text(`Removed ${id}.`)
    } catch (err) {
      return failure(err)
    }
  },
)

await server.connect(new StdioServerTransport())
