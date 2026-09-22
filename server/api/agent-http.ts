import { timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

// The agent HTTP API. Transport and auth only: it hands raw bodies to the
// handlers and never interprets content itself. Spec: docs/CONTRACT.md §4.3.

export interface AgentApiHandlers {
  submit(raw: unknown): { ok: true; id: string; updated: boolean; state: 'on-air' | 'queued' } | { ok: false; error: string }
  withdraw(id: string): boolean
  contents(): unknown
  stage(): unknown
}

export interface AgentApiOptions {
  port: number
  token: string
  handlers: AgentApiHandlers
  host?: string
}

const MAX_BODY = 64 * 1024

export async function startAgentApi({ port, token, handlers, host = '127.0.0.1' }: AgentApiOptions) {
  const expected = Buffer.from(token)
  const authorized = (req: IncomingMessage) => {
    const got = Buffer.from(String(req.headers['x-echo-token'] ?? ''))
    return got.length === expected.length && timingSafeEqual(got, expected)
  }

  const server = createServer(async (req, res) => {
    try {
      // No CORS headers anywhere, and no preflight: a web page can't talk to echo.
      if (!authorized(req)) return send(res, 401, { error: 'missing or wrong x-echo-token' })
      const url = new URL(req.url ?? '/', 'http://localhost')

      if (req.method === 'GET' && url.pathname === '/stage') return send(res, 200, handlers.stage())
      if (req.method === 'GET' && url.pathname === '/contents') return send(res, 200, handlers.contents())

      if (req.method === 'POST' && url.pathname === '/contents') {
        if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) {
          return send(res, 415, { error: 'content-type must be application/json' })
        }
        const body = await readJson(req)
        if (body === undefined) return send(res, 400, { error: 'body is not valid JSON (max 64 KB)' })
        const result = handlers.submit(body)
        if (!result.ok) return send(res, 400, { error: result.error })
        return send(res, 201, { id: result.id, updated: result.updated, state: result.state })
      }

      const del = url.pathname.match(/^\/contents\/(.+)$/)
      if (req.method === 'DELETE' && del) {
        return handlers.withdraw(decodeURIComponent(del[1]!)) ? send(res, 204) : send(res, 404, { error: 'no such content' })
      }

      return send(res, 404, { error: `no route for ${req.method} ${url.pathname}` })
    } catch (err) {
      return send(res, 500, { error: err instanceof Error ? err.message : String(err) })
    }
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => resolve())
  })

  return {
    port: (server.address() as AddressInfo).port,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

function send(res: ServerResponse, status: number, body?: unknown): void {
  if (body === undefined) {
    res.writeHead(status).end()
    return
  }
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }).end(JSON.stringify(body))
}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY) {
        resolve(undefined)
        req.destroy()
      } else chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        resolve(undefined)
      }
    })
    req.on('error', () => resolve(undefined))
  })
}
