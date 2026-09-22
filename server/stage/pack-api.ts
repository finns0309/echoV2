import type { Content, SignalFrame } from '@contract'

// The contract between the stage and content packs. Packs decide what to say
// and write it through PackContext; the stage decides when and where it shows.
export interface PackContext {
  upsert(content: Content): void
  remove(id: string): void
  emitSignal(frame: SignalFrame): void
}

export interface ContentPack {
  id: string
  kinds: readonly string[]
  start(ctx: PackContext): void
  stop(): void
}
