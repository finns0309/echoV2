// Composition root for the stdio MCP adapter. Claude Code spawns this process.
// It only forwards tool calls to the display server's agent HTTP API.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

const API = process.env.ECHO_API ?? 'http://127.0.0.1:10757'
const TOKEN = process.env.ECHO_TOKEN ?? ''

async function call(path: string): Promise<string> {
  const res = await fetch(API + path, { headers: { 'x-echo-token': TOKEN } })
  if (!res.ok) throw new Error(`echo answered ${res.status}`)
  return res.text()
}

const server = new McpServer({ name: 'echo', version: '0.0.0' })

server.registerTool(
  'status',
  {
    title: 'echo status',
    description: 'Show what echo is displaying right now: which content is on which surface and slot.',
    inputSchema: {},
  },
  async () => {
    try {
      return { content: [{ type: 'text', text: await call('/stage') }] }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      return { content: [{ type: 'text', text: `echo is not reachable at ${API} (${reason}). Is echo running?` }], isError: true }
    }
  },
)

await server.connect(new StdioServerTransport())
