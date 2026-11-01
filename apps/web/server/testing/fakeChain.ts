// Test doubles for the chain: a programmable RpcClient (views, access keys, blocks, tx status) and a
// Submitter that records txs and returns scripted outcomes. Outcome builders mirror RPC JSON.
import type { Action } from "near-api-js"
import { RpcError, type RpcClient } from "../chain/rpc"
import type { ExecStatus, ExecutionOutcomeWithId, FinalOutcome } from "../chain/near"
import type { SubmitOptions, SubmitResult, Submitter, TxSpec } from "../chain/submitter"

export const HEAD = 1_000_000
export const BLOCK_HASH = "4reLvkAWfqk5fsqio1KLudk46cqRz9erQdaHkWZKMJDZ"

export interface FakeAccount {
  amount: bigint
  storage: number
  keys: Map<string, { nonce: bigint; permission: unknown }>
}

export class FakeChain implements RpcClient {
  readonly urls = ["fake://rpc"]
  head = HEAD
  /** the optimistic head (block finality optimistic, access-key reads); defaults to `head` */
  optimisticHead: number | null = null
  accounts = new Map<string, FakeAccount>()
  views = new Map<string, (args: Record<string, unknown>) => unknown>()
  txs = new Map<string, FinalOutcome>()
  calls: { method: string; params: unknown }[] = []

  account(id: string, opts: Partial<{ amount: bigint; keys: Record<string, bigint> }> = {}): FakeAccount {
    const a: FakeAccount = {
      amount: opts.amount ?? 0n,
      storage: 182,
      keys: new Map(Object.entries(opts.keys ?? {}).map(([k, n]) => [k, { nonce: n, permission: "FullAccess" }])),
    }
    this.accounts.set(id, a)
    return a
  }

  view(contract: string, method: string, fn: (args: Record<string, unknown>) => unknown): this {
    this.views.set(`${contract}.${method}`, fn)
    return this
  }

  async call<T>(method: string, params: unknown): Promise<T> {
    this.calls.push({ method, params })
    const p = params as Record<string, unknown>
    if (method === "block") {
      const h = p.finality === "optimistic" ? (this.optimisticHead ?? this.head) : typeof p.block_id === "number" ? p.block_id : this.head
      return { header: { height: h, hash: BLOCK_HASH, timestamp_nanosec: "1793000000000000000" } } as T
    }
    if (method === "query") {
      if (p.request_type === "view_account") {
        const a = this.accounts.get(String(p.account_id))
        if (!a) throw new RpcError("UNKNOWN_ACCOUNT", null, "account does not exist")
        return { amount: a.amount.toString(), locked: "0", storage_usage: a.storage, code_hash: "1", block_height: this.head } as T
      }
      if (p.request_type === "view_access_key") {
        const k = this.accounts.get(String(p.account_id))?.keys.get(String(p.public_key))
        if (!k) throw new RpcError("UNKNOWN_ACCESS_KEY", null, "access key does not exist")
        return { nonce: Number(k.nonce), permission: k.permission, block_height: this.optimisticHead ?? this.head, block_hash: BLOCK_HASH } as T
      }
      if (p.request_type === "call_function") {
        const fn = this.views.get(`${String(p.account_id)}.${String(p.method_name)}`)
        if (!fn) throw new RpcError("CONTRACT_EXECUTION_ERROR", null, `no view ${String(p.account_id)}.${String(p.method_name)}`)
        const args = JSON.parse(Buffer.from(String(p.args_base64), "base64").toString("utf8") || "{}")
        const out = fn(args)
        if (out instanceof RpcError) throw out
        return { result: [...Buffer.from(JSON.stringify(out ?? null))], logs: [] } as T
      }
    }
    if (method === "tx" || method === "EXPERIMENTAL_tx_status") {
      const o = this.txs.get(String(p.tx_hash))
      if (!o) throw new RpcError("UNKNOWN_TRANSACTION", null, "unknown tx")
      return o as T
    }
    if (method === "broadcast_tx_async") return "hash" as T
    throw new RpcError("METHOD_NOT_FOUND", null, method)
  }
}

// ---------------------------------------------------------------------------------------------
// outcome builders

let seq = 0
const rid = () => `R${(++seq).toString().padStart(43, "x")}`
export const valueOf = (v: unknown): ExecStatus => ({ SuccessValue: Buffer.from(v === undefined ? "" : JSON.stringify(v)).toString("base64") })
export const panic = (msg: string): ExecStatus => ({
  Failure: { ActionError: { index: 0, kind: { FunctionCallError: { ExecutionError: `Smart contract panicked: ${msg}` } } } },
})

export interface ReceiptSpec {
  executor: string
  status?: ExecStatus
  logs?: string[]
  children?: ReceiptSpec[]
  /** follow-up receipt whose id becomes this receipt's SuccessReceiptId */
  then?: ReceiptSpec
  tokensBurnt?: bigint
}

export const event = (standard: string, name: string, data: unknown) =>
  `EVENT_JSON:${JSON.stringify({ standard, version: "1.0.0", event: name, data })}`

/**
 * A relayed tx: relayer → (delegate receipt on sender) → inner receipt on the delegate receiver (+ tree).
 * `top` overrides the top-level status (delegate-level failures).
 */
export function relayedOutcome(opts: {
  txHash: string
  relayer: string
  sender: string
  inner: ReceiptSpec
  top?: unknown
}): FinalOutcome {
  const receipts: ExecutionOutcomeWithId[] = []
  const build = (r: ReceiptSpec): string => {
    const id = rid()
    const childIds: string[] = []
    let status = r.status ?? valueOf(undefined)
    if (r.then) {
      const thenId = build(r.then)
      childIds.push(thenId)
      status = { SuccessReceiptId: thenId }
    }
    for (const c of r.children ?? []) childIds.push(build(c))
    receipts.push({
      id,
      block_hash: BLOCK_HASH,
      outcome: {
        logs: r.logs ?? [],
        receipt_ids: childIds,
        gas_burnt: 3_000_000_000_000,
        tokens_burnt: (r.tokensBurnt ?? 300_000_000_000_000_000_000n).toString(),
        executor_id: r.executor,
        status,
      },
    })
    return id
  }
  const innerId = opts.top ? null : build(opts.inner)
  const delegateId = rid()
  receipts.push({
    id: delegateId,
    block_hash: BLOCK_HASH,
    outcome: {
      logs: [],
      receipt_ids: innerId ? [innerId] : [],
      gas_burnt: 1_000_000_000_000,
      tokens_burnt: "100000000000000000000",
      executor_id: opts.sender,
      status: opts.top ? { Failure: opts.top } : { SuccessValue: "" },
    },
  })
  return {
    status: opts.top ? { Failure: opts.top } : { SuccessValue: "" },
    transaction: { hash: opts.txHash, signer_id: opts.relayer, receiver_id: opts.sender, nonce: 1, public_key: "ed25519:x" },
    transaction_outcome: {
      id: opts.txHash,
      block_hash: BLOCK_HASH,
      outcome: {
        logs: [],
        receipt_ids: [delegateId],
        gas_burnt: 300_000_000_000,
        tokens_burnt: "30000000000000000000",
        executor_id: opts.relayer,
        status: { SuccessReceiptId: delegateId },
      },
    },
    receipts_outcome: receipts.reverse(),
  }
}

/** A plain server tx outcome (create account, storage_deposit, sync, faucet). */
export function plainOutcome(txHash: string, signer: string, receiver: string, status: ExecStatus = valueOf(undefined), logs: string[] = []): FinalOutcome {
  const id = rid()
  return {
    status: "Failure" in (status as object) ? { Failure: (status as { Failure: unknown }).Failure } : { SuccessValue: "" },
    transaction: { hash: txHash, signer_id: signer, receiver_id: receiver, nonce: 1, public_key: "ed25519:x" },
    transaction_outcome: {
      id: txHash,
      block_hash: BLOCK_HASH,
      outcome: { logs: [], receipt_ids: [id], gas_burnt: 1, tokens_burnt: "1000", executor_id: signer, status: { SuccessReceiptId: id } },
    },
    receipts_outcome: [
      { id, block_hash: BLOCK_HASH, outcome: { logs, receipt_ids: [], gas_burnt: 1, tokens_burnt: "1000", executor_id: receiver, status } },
    ],
  }
}

// ---------------------------------------------------------------------------------------------

export type Script = (spec: TxSpec, opts: SubmitOptions, n: number) => FinalOutcome | "pending" | Error | Promise<FinalOutcome | "pending" | Error>

export class FakeSubmitter implements Submitter {
  submitted: { spec: TxSpec; opts: SubmitOptions; txHash: string }[] = []
  constructor(public script: Script) {}
  async submit(spec: TxSpec, opts: SubmitOptions): Promise<SubmitResult> {
    const n = this.submitted.length
    const txHash = `TX${n.toString().padStart(42, "0")}`
    this.submitted.push({ spec, opts, txHash })
    await opts.onSigned?.({ txHash, publicKey: "ed25519:relayerkey", nonce: BigInt(n + 1) })
    const r = await this.script(spec, opts, n)
    if (r instanceof Error) throw r
    if (r === "pending") return { kind: "pending", txHash, publicKey: "ed25519:relayerkey" }
    return { kind: "outcome", txHash, outcome: { ...r, transaction: { ...r.transaction, hash: txHash } }, publicKey: "ed25519:relayerkey" }
  }
}

export const methodOf = (spec: TxSpec): string => {
  const a = spec.actions[0] as unknown as { functionCall?: { methodName: string }; signedDelegate?: unknown }
  return a?.functionCall?.methodName ?? (a?.signedDelegate ? "delegate" : Object.keys((a ?? {}) as object)[0] ?? "")
}
export type { Action }
