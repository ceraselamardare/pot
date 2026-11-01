// Typed NEAR RPC reads and tx submission on top of the failover client.
import { RpcError, type RpcClient } from "./rpc"

export type Finality = "optimistic" | "final"
export type WaitUntil = "NONE" | "INCLUDED" | "EXECUTED_OPTIMISTIC" | "INCLUDED_FINAL" | "EXECUTED" | "FINAL"

export interface AccountView {
  amount: string
  locked: string
  storage_usage: number
  code_hash: string
  block_height: number
}

export type AccessKeyPermission =
  | "FullAccess"
  | { FunctionCall: { allowance: string | null; receiver_id: string; method_names: string[] } }

export interface AccessKeyView {
  nonce: bigint
  permission: AccessKeyPermission
  block_height: number
  block_hash: string
}

export interface BlockInfo {
  height: number
  hash: string
  timestampNs: string
}

// ---- execution outcomes (RPC JSON) ----
export type ExecStatus =
  | { SuccessValue: string }
  | { SuccessReceiptId: string }
  | { Failure: unknown }
  | "Unknown"
  | { Unknown?: unknown }

export interface ExecutionOutcomeWithId {
  id: string
  block_hash: string
  outcome: {
    logs: string[]
    receipt_ids: string[]
    gas_burnt: number
    tokens_burnt: string
    executor_id: string
    status: ExecStatus
  }
}

export interface FinalOutcome {
  status: { SuccessValue: string } | { Failure: unknown } | Record<string, unknown>
  transaction: { hash: string; signer_id: string; receiver_id: string; nonce: number; public_key: string }
  transaction_outcome: ExecutionOutcomeWithId
  receipts_outcome: ExecutionOutcomeWithId[]
  final_execution_status?: string
}

function isLegacyQueryError(r: unknown): r is { error: string } {
  return typeof r === "object" && r !== null && "error" in r && typeof (r as { error: unknown }).error === "string"
}

export async function viewAccount(rpc: RpcClient, accountId: string, finality: Finality = "final") {
  try {
    const r = await rpc.call<AccountView | { error: string }>("query", {
      request_type: "view_account",
      finality,
      account_id: accountId,
    })
    if (isLegacyQueryError(r)) {
      if (/does not exist/.test(r.error)) return null
      throw new RpcError("QUERY_ERROR", null, r.error)
    }
    return r
  } catch (e) {
    if (e instanceof RpcError && e.type === "UNKNOWN_ACCOUNT") return null
    throw e
  }
}

/** Available balance = amount − storage stake (1e19 yocto per byte). */
export function availableYocto(a: AccountView): bigint {
  const storage = BigInt(a.storage_usage) * 10_000_000_000_000_000_000n
  const amount = BigInt(a.amount)
  return amount > storage ? amount - storage : 0n
}

export async function viewAccessKey(
  rpc: RpcClient,
  accountId: string,
  publicKey: string,
  finality: Finality = "optimistic",
): Promise<AccessKeyView | null> {
  try {
    const r = await rpc.call<
      | { nonce: number | string; permission: AccessKeyPermission; block_height: number; block_hash: string }
      | { error: string }
    >("query", { request_type: "view_access_key", finality, account_id: accountId, public_key: publicKey })
    if (isLegacyQueryError(r)) {
      if (/does not exist/.test(r.error)) return null
      throw new RpcError("QUERY_ERROR", null, r.error)
    }
    return { nonce: BigInt(r.nonce), permission: r.permission, block_height: r.block_height, block_hash: r.block_hash }
  } catch (e) {
    if (e instanceof RpcError && (e.type === "UNKNOWN_ACCESS_KEY" || e.type === "UNKNOWN_ACCOUNT")) return null
    throw e
  }
}

export async function viewAccessKeyList(rpc: RpcClient, accountId: string, finality: Finality = "optimistic") {
  try {
    const r = await rpc.call<{ keys: { public_key: string; access_key: { nonce: number; permission: AccessKeyPermission } }[] }>(
      "query",
      { request_type: "view_access_key_list", finality, account_id: accountId },
    )
    return r.keys
  } catch (e) {
    if (e instanceof RpcError && e.type === "UNKNOWN_ACCOUNT") return null
    throw e
  }
}

export async function block(rpc: RpcClient, ref: { finality: Finality } | { blockId: string | number }): Promise<BlockInfo> {
  const params = "finality" in ref ? { finality: ref.finality } : { block_id: ref.blockId }
  const r = await rpc.call<{ header: { height: number; hash: string; timestamp_nanosec: string } }>("block", params)
  return { height: r.header.height, hash: r.header.hash, timestampNs: r.header.timestamp_nanosec }
}

/** A JSON view call. Contract panics surface as RpcError (type CONTRACT_EXECUTION_ERROR or QUERY_ERROR). */
export async function viewFunction<T>(
  rpc: RpcClient,
  contractId: string,
  method: string,
  args: unknown = {},
  finality: Finality = "optimistic",
): Promise<T> {
  const r = await rpc.call<{ result: number[]; logs: string[] } | { error: string }>("query", {
    request_type: "call_function",
    finality,
    account_id: contractId,
    method_name: method,
    args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
  })
  if (isLegacyQueryError(r)) throw new RpcError("CONTRACT_EXECUTION_ERROR", null, r.error)
  const text = Buffer.from(r.result).toString("utf8")
  return (text === "" ? null : JSON.parse(text)) as T
}

export async function sendTx(rpc: RpcClient, signedTxBase64: string, waitUntil: WaitUntil, timeoutMs = 20_000) {
  return rpc.call<FinalOutcome>("send_tx", { signed_tx_base64: signedTxBase64, wait_until: waitUntil }, { timeoutMs })
}

const EXECUTED = new Set(["EXECUTED_OPTIMISTIC", "EXECUTED", "FINAL"])
/** A send_tx / tx answer that carries the whole receipt tree (older nodes and fakes omit the field). */
export function isExecuted(r: unknown): boolean {
  const st = (r as { final_execution_status?: string } | null)?.final_execution_status
  return !!r && typeof r === "object" && "receipts_outcome" in r && (st === undefined || EXECUTED.has(st))
}

/** tx status; null while the tx is unknown to the node. */
export async function txStatus(
  rpc: RpcClient,
  txHash: string,
  senderId: string,
  waitUntil: WaitUntil = "EXECUTED_OPTIMISTIC",
  timeoutMs = 10_000,
): Promise<FinalOutcome | null> {
  try {
    const r = await rpc.call<FinalOutcome>(
      "tx",
      { tx_hash: txHash, sender_account_id: senderId, wait_until: waitUntil },
      { timeoutMs },
    )
    // with wait_until NONE/INCLUDED the node may answer without outcomes, or with a PARTIAL tree whose
    // receipts are still "Started" (seen on testnet, wave 3): only an executed status is an outcome
    if (!r || !("receipts_outcome" in r) || !isExecuted(r)) return null
    return r
  } catch (e) {
    if (e instanceof RpcError && (e.type === "UNKNOWN_TRANSACTION" || e.type === "TIMEOUT_ERROR")) return null
    throw e
  }
}
