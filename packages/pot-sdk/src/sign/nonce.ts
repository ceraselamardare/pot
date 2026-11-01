// Nonce and expiry helpers (frontend-architecture §4.7, kb/meta-tx-relayer.md gotchas 3 and 6).
//  - nonce = max(view_access_key(optimistic).nonce, lastUsed[account:pk]) + 1, read just before signing
//  - maxBlockHeight = block_height (same response) + 200 for device/demo, + 600 for NEAR Auth
//  - the relayer accepts head + 10 < max_block_height ≤ head + 600
//  - one delegate in flight per key (SigningQueue), signing when a job STARTS
// Dependency-free: safe to use outside the lazy signing chunk.

export const DEFAULT_DELEGATE_TTL_BLOCKS = 200
export const NEAR_AUTH_DELEGATE_TTL_BLOCKS = 600
export const RELAYER_MIN_REMAINING_BLOCKS = 10
export const RELAYER_MAX_TTL_BLOCKS = 600

export function nextNonce(chainNonce: bigint, lastUsed?: bigint | null): bigint {
  const base = lastUsed != null && lastUsed > chainNonce ? lastUsed : chainNonce
  return base + 1n
}

export function maxBlockHeightFor(blockHeight: number | bigint, ttlBlocks: number = DEFAULT_DELEGATE_TTL_BLOCKS): bigint {
  return BigInt(blockHeight) + BigInt(ttlBlocks)
}

/** The relayer's window check (api-spec §3.2 step 10): null when acceptable. */
export function delegateWindowError(maxBlockHeight: bigint, head: number | bigint): "expired" | "ttl_too_long" | null {
  const h = BigInt(head)
  if (maxBlockHeight <= h + BigInt(RELAYER_MIN_REMAINING_BLOCKS)) return "expired"
  if (maxBlockHeight > h + BigInt(RELAYER_MAX_TTL_BLOCKS)) return "ttl_too_long"
  return null
}

const keyOf = (account: string, publicKey: string): string => `${account}:${publicKey}`

/** Remembers the last nonce used per account:key so back-to-back delegates don't collide. */
export class NonceTracker {
  private readonly last = new Map<string, bigint>()

  /** Returns the nonce to use now and records it. */
  next(account: string, publicKey: string, chainNonce: bigint): bigint {
    const n = nextNonce(chainNonce, this.last.get(keyOf(account, publicKey)))
    this.last.set(keyOf(account, publicKey), n)
    return n
  }
  lastUsed(account: string, publicKey: string): bigint | undefined {
    return this.last.get(keyOf(account, publicKey))
  }
  /** After `nonce_used` / `expired`: forget local state and re-read the chain. */
  reset(account: string, publicKey: string): void {
    this.last.delete(keyOf(account, publicKey))
  }
}

export class SigningTimeoutError extends Error {
  constructor(ms: number) {
    super(`signing job timed out after ${ms} ms`)
    this.name = "SigningTimeoutError"
  }
}

/** FIFO per key, one job in flight per key, a per-job timeout (default 30 s). */
export class SigningQueue {
  private readonly tails = new Map<string, Promise<unknown>>()
  private readonly timeoutMs: number

  constructor(timeoutMs = 30_000) {
    this.timeoutMs = timeoutMs
  }

  run<T>(key: string, job: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(key) ?? Promise.resolve()
    const ms = this.timeoutMs
    const p = prev.then(
      () =>
        new Promise<T>((resolve, reject) => {
          const t = setTimeout(() => reject(new SigningTimeoutError(ms)), ms)
          job().then(
            (v) => {
              clearTimeout(t)
              resolve(v)
            },
            (e: unknown) => {
              clearTimeout(t)
              reject(e)
            },
          )
        }),
    )
    const tail = p.catch(() => undefined)
    this.tails.set(key, tail)
    void tail.then(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key)
    })
    return p
  }

  /** Jobs queued or running for a key. */
  busy(key: string): boolean {
    return this.tails.has(key)
  }
}
