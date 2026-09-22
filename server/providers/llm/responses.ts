// L0 adapter for an OpenAI-style Responses endpoint. Knows the wire format and
// nothing else: no caching, no retries, no idea what it is being asked.
// The fetch implementation is injected (Electron's net.fetch follows the
// system proxy), so this file never imports Electron.

export interface ResponsesConfig {
  apiKey: string
  model: string
  baseUrl: string
  timeoutMs?: number
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>

export function createResponsesClient(cfg: ResponsesConfig, fetchImpl: FetchLike) {
  const base = cfg.baseUrl.replace(/\/+$/, '')

  return {
    async complete({ instructions, input }: { instructions: string; input: string }): Promise<string> {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs ?? 60_000)
      try {
        const res = await fetchImpl(`${base}/v1/responses`, {
          method: 'POST',
          headers: { authorization: `Bearer ${cfg.apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            model: cfg.model,
            max_output_tokens: 8000, // reasoning tokens count too
            temperature: 0, // deterministic: the same content always gets the same staging
            reasoning: { effort: 'low' },
            store: false,
            instructions,
            input: [{ role: 'user', content: input }],
          }),
          signal: ctrl.signal,
        })
        if (!res.ok) throw new Error(`responses ${res.status}: ${(await res.text()).slice(0, 200)}`)
        const body = (await res.json()) as { output?: { content?: { type?: string; text?: string }[] }[] }
        // Output mixes reasoning items (no content) with messages; keep only output_text.
        return (body.output ?? [])
          .flatMap((o) => o.content ?? [])
          .map((c) => (c.type === 'output_text' ? (c.text ?? '') : ''))
          .join('')
      } finally {
        clearTimeout(timer)
      }
    },
  }
}
