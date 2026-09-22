import { afterEach, describe, expect, it } from 'vitest'
import { startAgentApi, type AgentApiHandlers } from './agent-http'

const TOKEN = 'test-token'
let close: (() => Promise<void>) | undefined

afterEach(async () => {
  await close?.()
  close = undefined
})

async function start(overrides: Partial<AgentApiHandlers> = {}) {
  const submitted: unknown[] = []
  const handlers: AgentApiHandlers = {
    submit: (raw) => {
      submitted.push(raw)
      return { ok: true, id: 'card:x', updated: false, state: 'queued' as const }
    },
    withdraw: (id) => id === 'card:x',
    withdrawGroup: (group) => (group === 'murmur' ? 3 : 0),
    contents: () => [],
    stage: () => ({ rev: 3, surfaces: {} }),
    ...overrides,
  }
  const api = await startAgentApi({ port: 0, token: TOKEN, handlers })
  close = api.close
  const base = `http://127.0.0.1:${api.port}`
  const call = (path: string, init: RequestInit = {}, token = TOKEN) =>
    fetch(base + path, { ...init, headers: { 'x-echo-token': token, ...init.headers } })
  return { call, submitted }
}

describe('agent HTTP API', () => {
  it('rejects requests without the right token', async () => {
    const { call } = await start()
    expect((await call('/stage', {}, 'wrong')).status).toBe(401)
    expect((await call('/stage', {}, '')).status).toBe(401)
  })

  it('serves the stage to an authorized caller', async () => {
    const { call } = await start()
    const res = await call('/stage')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ rev: 3, surfaces: {} })
  })

  it('hands a JSON body to submit and returns where the card went', async () => {
    const { call, submitted } = await start()
    const res = await call('/contents', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"lines":["hi"]}' })
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ id: 'card:x', updated: false, state: 'queued' })
    expect(submitted).toEqual([{ lines: ['hi'] }])
  })

  it('withdraws a whole group', async () => {
    const { call } = await start()
    const res = await call('/contents?group=murmur', { method: 'DELETE' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ removed: 3 })
    expect((await call('/contents', { method: 'DELETE' })).status).toBe(400)
  })

  it('refuses non-JSON bodies, which is what a cross-site form post would be', async () => {
    const { call } = await start()
    const res = await call('/contents', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' })
    expect(res.status).toBe(415)
  })

  it('reports validation errors from the pack as 400', async () => {
    const { call } = await start({ submit: () => ({ ok: false, error: 'send lines' }) })
    const res = await call('/contents', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'send lines' })
  })

  it('withdraws by id', async () => {
    const { call } = await start()
    expect((await call('/contents/card%3Ax', { method: 'DELETE' })).status).toBe(204)
    expect((await call('/contents/nope', { method: 'DELETE' })).status).toBe(404)
  })
})
