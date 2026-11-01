// Receipt-tree helpers for relayed txs (api-spec §3.4). A relayed tx's top-level status is the delegate's
// SuccessValue("") even when the inner call panics, so everything is read from receipts_outcome.
import { errorCodeFromText } from "@pot/sdk"
import type { ExecStatus, ExecutionOutcomeWithId, FinalOutcome } from "./near"

export type Final =
  | { kind: "value"; raw: string; json: unknown; receiptId: string; executor: string }
  | { kind: "failure"; error: string; receiptId: string; executor: string }
  | { kind: "unknown" }

export function receiptsById(o: FinalOutcome): Map<string, ExecutionOutcomeWithId> {
  return new Map(o.receipts_outcome.map((r) => [r.id, r]))
}

/** predecessor of each receipt = the executor of the receipt that created it (tx signer for the first). */
export function predecessors(o: FinalOutcome): Map<string, string> {
  const m = new Map<string, string>()
  for (const id of o.transaction_outcome.outcome.receipt_ids) m.set(id, o.transaction.signer_id)
  for (const r of o.receipts_outcome) for (const child of r.outcome.receipt_ids) m.set(child, r.outcome.executor_id)
  return m
}

const isObj = (s: ExecStatus): s is Exclude<ExecStatus, string> => typeof s === "object" && s !== null

export const statusFailure = (s: ExecStatus): unknown | undefined => (isObj(s) && "Failure" in s ? s.Failure : undefined)
export const statusValue = (s: ExecStatus): string | undefined =>
  isObj(s) && "SuccessValue" in s ? (s.SuccessValue as string) : undefined
export const statusReceipt = (s: ExecStatus): string | undefined =>
  isObj(s) && "SuccessReceiptId" in s ? (s.SuccessReceiptId as string) : undefined

/** Remove control characters (RPC JSON can carry raw ones from assert_eq! panics) and cap at 2 KB. */
export function sanitize(text: string): string {
  return text.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").slice(0, 2048)
}

/** The human-readable error of a Failure status: ExecutionError text when present, else compact JSON. */
export function failureText(failure: unknown): string {
  const f = failure as { ActionError?: { kind?: unknown } } | undefined
  const kind = f?.ActionError?.kind as { FunctionCallError?: { ExecutionError?: string } } | string | undefined
  if (kind && typeof kind === "object" && kind.FunctionCallError?.ExecutionError)
    return sanitize(kind.FunctionCallError.ExecutionError)
  return sanitize(JSON.stringify(failure))
}

/** The receipt in which the delegate's receiver executes the delegated actions. */
export function innerReceipt(o: FinalOutcome, delegateReceiver: string): ExecutionOutcomeWithId | undefined {
  const byId = receiptsById(o)
  const first = o.transaction_outcome.outcome.receipt_ids[0]
  const delegateReceipt = first ? byId.get(first) : undefined
  if (!delegateReceipt) return undefined
  for (const child of delegateReceipt.outcome.receipt_ids) {
    const r = byId.get(child)
    if (r && r.outcome.executor_id === delegateReceiver) return r
  }
  return o.receipts_outcome.find((r) => r.outcome.executor_id === delegateReceiver)
}

/** Follow SuccessReceiptId from `start` to the chain's final value (contracts-spec return values). */
export function followFinal(o: FinalOutcome, start: ExecutionOutcomeWithId | undefined): Final {
  const byId = receiptsById(o)
  let cur = start
  for (let hops = 0; cur && hops < 64; hops++) {
    const s = cur.outcome.status
    const fail = statusFailure(s)
    if (fail !== undefined)
      return { kind: "failure", error: failureText(fail), receiptId: cur.id, executor: cur.outcome.executor_id }
    const v = statusValue(s)
    if (v !== undefined) {
      let json: unknown = undefined
      try {
        const text = Buffer.from(v, "base64").toString("utf8")
        json = text === "" ? null : JSON.parse(text)
      } catch {
        json = undefined
      }
      return { kind: "value", raw: v, json, receiptId: cur.id, executor: cur.outcome.executor_id }
    }
    const next = statusReceipt(s)
    if (!next) break
    cur = byId.get(next)
  }
  return { kind: "unknown" }
}

export const firstFailure = (o: FinalOutcome, pred?: (r: ExecutionOutcomeWithId) => boolean) =>
  o.receipts_outcome.find((r) => statusFailure(r.outcome.status) !== undefined && (!pred || pred(r)))

export interface RawEvent {
  standard: string
  version: string
  event: string
  data: unknown
  executor: string
  receiptId: string
  blockHash: string
  index: number
}

/** NEP-297 EVENT_JSON logs, only from trusted executors (hub → "pot", token → "nep141"). */
export function trustedEvents(o: FinalOutcome, hubId: string, tokenId: string): RawEvent[] {
  const out: RawEvent[] = []
  for (const r of o.receipts_outcome) {
    let index = 0
    for (const line of r.outcome.logs) {
      if (!line.startsWith("EVENT_JSON:")) continue
      const i = index++
      try {
        const e = JSON.parse(line.slice("EVENT_JSON:".length)) as { standard?: string; version?: string; event?: string; data?: unknown }
        const ok =
          (r.outcome.executor_id === hubId && e.standard === "pot") ||
          (r.outcome.executor_id === tokenId && e.standard === "nep141")
        if (!ok || typeof e.event !== "string") continue
        // NEP-297 `data` is an array for nep141; the hub emits a single object (contracts-spec §5)
        out.push({
          standard: e.standard!,
          version: String(e.version ?? ""),
          event: e.event,
          data: e.data,
          executor: r.outcome.executor_id,
          receiptId: r.id,
          blockHash: r.block_hash,
          index: i,
        })
      } catch {
        // malformed log: ignore
      }
    }
  }
  return out
}

/** The tx's gas cost: Σ tokens_burnt over the tx and every receipt. */
export function burnt(o: FinalOutcome): { yocto: bigint; gas: bigint } {
  let yocto = BigInt(o.transaction_outcome.outcome.tokens_burnt)
  let gas = BigInt(o.transaction_outcome.outcome.gas_burnt)
  for (const r of o.receipts_outcome) {
    yocto += BigInt(r.outcome.tokens_burnt)
    gas += BigInt(r.outcome.gas_burnt)
  }
  return { yocto, gas }
}

export const blockHashes = (o: FinalOutcome): string[] => [
  ...new Set([o.transaction_outcome.block_hash, ...o.receipts_outcome.map((r) => r.block_hash)]),
]

/** ERR_* token, or a synthetic code (api-spec §1.3): @pot/sdk's errorCodeFromText. */
export const errorCodeOf = (text: string): string => errorCodeFromText(text)

/** Delegate-level failure (top-level Failure) → api-spec §1.2 reason. */
export function delegateFailureReason(
  failure: unknown,
): "expired" | "nonce_used" | "key_not_found" | "fc_key_deposit" | "bad_signature" | "internal" {
  const s = JSON.stringify(failure)
  if (s.includes("DelegateActionExpired")) return "expired"
  if (s.includes("DelegateActionInvalidNonce") || s.includes("DelegateActionNonceTooLarge")) return "nonce_used"
  if (s.includes("DepositWithFunctionCall")) return "fc_key_deposit"
  if (s.includes("AccessKeyNotFound") || s.includes("AccountDoesNotExist")) return "key_not_found"
  if (s.includes("DelegateActionInvalidSignature")) return "bad_signature"
  return "internal"
}
