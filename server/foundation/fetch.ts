/** The fetch a provider is given: global fetch, or Electron's net.fetch (which follows the system proxy). */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>
