// Server-signed transactions through a leased pool key (api-spec §3.3; architecture §4.1 timeout algorithm).
// One key serves one tx at a time: lease → read nonce (optimistic) → sign → store the hash BEFORE broadcast
// (onSigned) → send_tx → release. On an unknown outcome: poll tx status, re-broadcast the same bytes while the
// key nonce is below ours, and give up with `pending` at the budget (the route answers 202).
import "server-only"
import { createTransaction, KeyPairSigner, PublicKey, type Action } from "near-api-js"
import { claimPoolLeaseWait, ensurePoolRows, releaseLease, setLastNonce } from "@/db/lease"
import type { DbOrTx } from "@/db/client"
import { unavailable } from "../http/errors"
import { b64, bs58 } from "../util/crypto"
import { block, isExecuted, sendTx, txStatus, viewAccessKey, type FinalOutcome, type WaitUntil } from "./near"
import { RpcError, RpcUnavailableError, type RpcClient } from "./rpc"
import type { PoolKey } from "./keys"

export interface TxSpec {
  signerId: string
  receiverId: string
  actions: Action[]
}

export interface SubmitOptions {
  pool: string
  holder: string
  waitUntil?: WaitUntil
  /** total budget before answering `pending` (api-spec: 25 s for relays) */
  budgetMs?: number
  leaseTtlSec?: number
  /** called with the outer tx hash before broadcast (relay_log status `signed`) */
  onSigned?: (info: { txHash: string; publicKey: string; nonce: bigint }) => Promise<void>
  /** raced with the wait; resolve to stop waiting early is NOT supported: the probe only observes */
  busyCause?: "relayer_busy" | "treasury"
  /**
   * B-19 (wave 3): free the key as soon as the tx is INCLUDED and wait for the outcome without it (default for
   * EXECUTED_OPTIMISTIC waits). A key then serves one tx per ~1.5 s instead of one per receipt tree (~8 s for a
   * spend with a payout). The next holder signs above `lease.meta.lastNonce` (an RPC node may lag).
   */
  releaseOnInclusion?: boolean
}

export type SubmitResult =
  | { kind: "outcome"; txHash: string; outcome: FinalOutcome; publicKey: string }
  | { kind: "pending"; txHash: string; publicKey: string }

export interface Submitter {
  submit(spec: TxSpec, opts: SubmitOptions): Promise<SubmitResult>
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const isNonceError = (e: unknown) =>
  e instanceof RpcError && /InvalidNonce|Expired|InvalidTxError.*nonce/i.test(`${e.message} ${JSON.stringify(e.info)}`)
/** The chain's access-key nonce from an InvalidNonce error ({…InvalidNonce: {tx_nonce, ak_nonce}}), if present. */
export function akNonceOf(e: unknown): bigint | null {
  const m = e instanceof RpcError ? JSON.stringify(e.info ?? {}).match(/"ak_nonce":\s*"?(\d+)/) : null
  return m ? BigInt(m[1]!) : null
}
/** Nonce errors are retried (re-read + re-sign) this many times: another process may share the key pool
 *  (a local dev server and a live test use different lease tables), or an optimistic read may be stale. */
const NONCE_RETRIES = 3

export function createSubmitter(deps: { db: DbOrTx; rpc: RpcClient; pools: Record<string, PoolKey[]> }): Submitter {
  const seeded = new Map<string, Promise<void>>()
  const seed = (pool: string) => {
    let p = seeded.get(pool)
    if (!p) {
      const keys = deps.pools[pool] ?? []
      p = ensurePoolRows(
        deps.db,
        pool,
        keys.map((k) => ({ publicKey: k.publicKey })),
      ).catch((e) => {
        seeded.delete(pool)
        throw e
      })
      seeded.set(pool, p)
    }
    return p
  }

  async function signFor(spec: TxSpec, key: PoolKey, minNonce = 0n) {
    // minNonce: the lease row's lastNonce + 1 (a tx this key sent moments ago), or past an InvalidNonce
    const [ak, head] = await Promise.all([
      viewAccessKey(deps.rpc, spec.signerId, key.publicKey, "optimistic"),
      block(deps.rpc, { finality: "final" }),
    ])
    if (!ak) throw new Error(`pool key not on ${spec.signerId}`)
    const nonce = ak.nonce + 1n > minNonce ? ak.nonce + 1n : minNonce
    const tx = createTransaction(
      spec.signerId,
      PublicKey.from(key.publicKey),
      spec.receiverId,
      nonce,
      spec.actions,
      bs58.decode(head.hash),
    )
    const { txHash, signedTransaction } = await new KeyPairSigner(key.keyPair).signTransaction(tx)
    return { txHash: bs58.encode(txHash), bytes: b64(signedTransaction.encode()), nonce }
  }

  async function submit(spec: TxSpec, opts: SubmitOptions): Promise<SubmitResult> {
    const keys = deps.pools[opts.pool] ?? []
    if (keys.length === 0) throw unavailable(opts.busyCause ?? "relayer_busy", 5_000, { pool: opts.pool, why: "no_keys" })
    await seed(opts.pool)
    const lease = await claimPoolLeaseWait(deps.db, opts.pool, opts.holder, opts.leaseTtlSec ?? 30)
    if (!lease) throw unavailable(opts.busyCause ?? "relayer_busy", 2_000)
    const deadline = Date.now() + (opts.budgetMs ?? 25_000)
    const meta = (lease.meta ?? {}) as { publicKey?: string; lastNonce?: string }
    const key = keys.find((k) => k.publicKey === meta.publicKey)
    const waitUntil = opts.waitUntil ?? "EXECUTED_OPTIMISTIC"
    const early = (opts.releaseOnInclusion ?? true) && waitUntil === "EXECUTED_OPTIMISTIC"
    let held = true
    const release = async () => {
      if (!held) return
      held = false
      await releaseLease(deps.db, lease.name, opts.holder).catch(() => undefined)
    }
    try {
      if (!key) throw new Error(`lease ${lease.name} has no loaded key`)
      const floor = meta.lastNonce && /^[0-9]+$/.test(meta.lastNonce) ? BigInt(meta.lastNonce) + 1n : 0n
      let signed = await signFor(spec, key, floor)
      await opts.onSigned?.({ txHash: signed.txHash, publicKey: key.publicKey, nonce: signed.nonce })
      for (let attempt = 0; ; attempt++) {
        try {
          const remaining = Math.max(1_000, deadline - Date.now())
          const res = await sendTx(deps.rpc, signed.bytes, early ? "INCLUDED" : waitUntil, Math.min(remaining, 20_000))
          if (early && !isExecuted(res)) {
            // included: the key's nonce is consumed on chain; hand the key to the next request now
            await setLastNonce(deps.db, lease.name, opts.holder, signed.nonce)
            await release()
            const outcome = await waitExecuted(spec.signerId, signed.txHash, deadline)
            if (outcome) return { kind: "outcome", txHash: signed.txHash, outcome, publicKey: key.publicKey }
            return { kind: "pending", txHash: signed.txHash, publicKey: key.publicKey }
          }
          return { kind: "outcome", txHash: signed.txHash, outcome: res, publicKey: key.publicKey }
        } catch (e) {
          if (attempt < NONCE_RETRIES && isNonceError(e)) {
            // another holder's tx moved the nonce (or the block hash expired): re-read and re-sign, above
            // the chain's ak_nonce when the error carries it
            const ak = akNonceOf(e)
            if (attempt > 0) await sleep(150 + Math.floor(Math.random() * 250))
            signed = await signFor(spec, key, ak !== null && ak + 1n > signed.nonce + 1n ? ak + 1n : signed.nonce + 1n)
            await opts.onSigned?.({ txHash: signed.txHash, publicKey: key.publicKey, nonce: signed.nonce })
            continue
          }
          const unknownOutcome =
            e instanceof RpcUnavailableError ||
            (e instanceof RpcError && (e.type === "TIMEOUT_ERROR" || e.type === "RATE_LIMITED")) ||
            (e instanceof Error && e.name === "AbortError")
          if (!unknownOutcome) throw e
          const found = await waitForOutcome(spec.signerId, key.publicKey, signed, deadline)
          if (found) return { kind: "outcome", txHash: signed.txHash, outcome: found, publicKey: key.publicKey }
          return { kind: "pending", txHash: signed.txHash, publicKey: key.publicKey }
        }
      }
    } finally {
      await release()
    }
  }

  /** After inclusion: tx status at EXECUTED_OPTIMISTIC until the budget (the key is already released). */
  async function waitExecuted(signerId: string, txHash: string, deadline: number): Promise<FinalOutcome | null> {
    while (Date.now() < deadline) {
      const left = deadline - Date.now()
      const st = await txStatus(deps.rpc, txHash, signerId, "EXECUTED_OPTIMISTIC", Math.max(1_000, Math.min(left, 10_000))).catch(() => null)
      if (st) return st
      await sleep(Math.min(500, Math.max(0, deadline - Date.now())))
    }
    return null
  }

  async function waitForOutcome(
    signerId: string,
    publicKey: string,
    signed: { txHash: string; bytes: string; nonce: bigint },
    deadline: number,
  ): Promise<FinalOutcome | null> {
    while (Date.now() < deadline) {
      const st = await txStatus(deps.rpc, signed.txHash, signerId, "EXECUTED_OPTIMISTIC", 5_000).catch(() => null)
      if (st) return st
      const ak = await viewAccessKey(deps.rpc, signerId, publicKey, "optimistic").catch(() => null)
      if (ak && ak.nonce < signed.nonce) {
        // not landed yet: re-broadcast the same bytes (same hash, can't land twice)
        await deps.rpc.call("broadcast_tx_async", [signed.bytes]).catch(() => undefined)
      }
      await sleep(1_000)
    }
    return null
  }

  return { submit }
}
