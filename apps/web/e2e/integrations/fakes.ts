// The integrations tier's fakes, one process (run by Playwright's webServer with tsx):
//  - a fake NEAR JSON-RPC (testnet-shaped answers, CORS on) so the real app — server routes AND the browser's reads —
//    runs end to end without touching testnet: accounts and access keys, `call_function` views, `send_tx` that
//    applies CreateAccount / AddKey / storage_deposit / ft_transfer / fast-auth `sign` (a local "MPC" key signs
//    sha256(payload)) / a relayed SignedDelegate;
//  - the fake NEAR Auth issuer (server/features/nearauth/fakeIssuer.ts);
//  - a fresh Postgres schema for the app server (pot_test, migrated from db/migrations).
// Control: POST /__control {op:"account", id, keys:[pk]} · GET /__state?account=… · GET /health.
import { createHash } from "node:crypto"
import { createServer } from "node:http"
import { ed25519 } from "@noble/curves/ed25519.js"
import { base58 } from "@scure/base"
import { decodeSignedTransaction, encodeTransaction, PublicKey } from "near-api-js"
import { Pool } from "pg"
import { migrationStatements } from "../../db/testing"
import { startFakeIssuer } from "../../server/features/nearauth/fakeIssuer"

const RPC_PORT = Number(process.env.FAKE_RPC_PORT ?? 3791)
const ISSUER_PORT = Number(process.env.FAKE_ISSUER_PORT ?? 3792)
const SCHEMA = process.env.FAKE_DB_SCHEMA ?? "t_e2e_integrations"
const TEST_DB = process.env.DATABASE_URL_TEST ?? "postgres://pot:pot@localhost:54329/pot_test"
const HUB = process.env.NEXT_PUBLIC_HUB_ID ?? "pots.potprev.testnet"
const USDC = process.env.NEXT_PUBLIC_USDC_ID ?? "usdc.potprev.testnet"
const RELAYER = process.env.RELAYER_ACCOUNT_ID ?? "users.potprev.testnet"
const TREASURY = process.env.TREASURY_ACCOUNT_ID ?? "treasury.potprev.testnet"
const NEAR = 10n ** 24n

// ---- chain state ----
interface Account {
  amount: bigint
  keys: Map<string, { nonce: bigint; permission: unknown }>
}
const accounts = new Map<string, Account>()
/** sponsor accounts: any key is a full-access key (the app's real pool keys sign, nothing reaches a chain) */
const permissive = new Set([RELAYER, TREASURY, HUB, USDC])
const registered = new Set<string>()
const balances = new Map<string, bigint>()
const txs = new Map<string, unknown>()
let height = 200_000_000
const mpcSeed = ed25519.utils.randomSecretKey()
const MPC_PK = `ed25519:${base58.encode(ed25519.getPublicKey(mpcSeed))}`
const blockHash = () => base58.encode(createHash("sha256").update(String(height)).digest())
setInterval(() => height++, 600).unref()

for (const id of permissive) accounts.set(id, { amount: 50n * NEAR, keys: new Map() })

function accessKey(account: string, pk: string) {
  const a = accounts.get(account)
  if (!a) return null
  let k = a.keys.get(pk)
  if (!k && permissive.has(account)) {
    k = { nonce: BigInt(height) * 1_000_000n, permission: "FullAccess" }
    a.keys.set(pk, k)
  }
  return k ?? null
}

class RpcFail extends Error {
  constructor(readonly cause_: string, message: string, readonly info: Record<string, unknown> = {}) {
    super(message)
  }
}

const json = (v: unknown) => [...Buffer.from(JSON.stringify(v))]
/** borsh-decoded keys are plain enum objects ({ed25519Key: {data}}): normalise to "ed25519:…" */
const pkStr = (k: unknown): string => PublicKey.from(k as never).toString()

function view(contract: string, method: string, args: Record<string, unknown>): unknown {
  if (method === "derived_public_key") return MPC_PK
  if (contract === USDC) {
    if (method === "storage_balance_of") return registered.has(String(args.account_id)) ? { total: "1250000000000000000000", available: "0" } : null
    if (method === "ft_balance_of") return (balances.get(String(args.account_id)) ?? 0n).toString()
    if (method === "ft_metadata") return { spec: "ft-1.0.0", name: "USDC (test)", symbol: "USDC", decimals: 6 }
    if (method === "storage_balance_bounds") return { min: "1250000000000000000000", max: "1250000000000000000000" }
  }
  if (contract === HUB) {
    if (method === "get_pots_of") return []
    if (method === "get_requests" || method === "get_members") return []
    return null
  }
  throw new RpcFail("CONTRACT_EXECUTION_ERROR", `MethodNotFound ${contract}.${method}`, { vm_error: "MethodResolveError(MethodNotFound)" })
}

const rid = (() => {
  let n = 0
  return () => base58.encode(createHash("sha256").update(`r${++n}${Math.random()}`).digest())
})()

type Act = Record<string, unknown>

/** Apply one action list as `signer` on `receiver`; returns the receipt's status. */
function apply(signer: string, receiver: string, actions: Act[]): Record<string, unknown> {
  let status: Record<string, unknown> = { SuccessValue: "" }
  for (const a of actions) {
    if ("createAccount" in a) {
      if (accounts.has(receiver)) return { Failure: { ActionError: { index: 0, kind: { AccountAlreadyExists: { account_id: receiver } } } } }
      accounts.set(receiver, { amount: 0n, keys: new Map() })
    } else if ("addKey" in a) {
      const ak = a.addKey as { publicKey: unknown }
      const acc = accounts.get(receiver)
      if (!acc) return { Failure: { ActionError: { index: 0, kind: { AccountDoesNotExist: { account_id: receiver } } } } }
      acc.keys.set(pkStr(ak.publicKey), { nonce: BigInt(height) * 1_000_000n, permission: "FullAccess" })
    } else if ("transfer" in a) {
      const acc = accounts.get(receiver)
      if (acc) acc.amount += BigInt((a.transfer as { deposit: bigint }).deposit)
    } else if ("functionCall" in a) {
      const fc = a.functionCall as { methodName: string; args: Uint8Array }
      const args = JSON.parse(Buffer.from(fc.args).toString("utf8") || "{}") as Record<string, unknown>
      if (receiver === USDC && fc.methodName === "storage_deposit") registered.add(String(args.account_id ?? signer))
      else if (receiver === USDC && fc.methodName === "ft_transfer") {
        const to = String(args.receiver_id)
        const amt = BigInt(String(args.amount))
        balances.set(signer, (balances.get(signer) ?? 10n ** 12n) - amt)
        balances.set(to, (balances.get(to) ?? 0n) + amt)
      } else if (fc.methodName === "sign" && receiver.startsWith("fast-auth")) {
        const payload = Uint8Array.from(args.sign_payload as number[])
        const sig = ed25519.sign(createHash("sha256").update(payload).digest(), mpcSeed)
        status = { SuccessValue: Buffer.from(JSON.stringify({ scheme: "Ed25519", signature: [...sig] })).toString("base64") }
      }
    } else if ("signedDelegate" in a) {
      const sd = a.signedDelegate as { delegateAction: { senderId: string; receiverId: string; actions: Act[]; publicKey: unknown; nonce: bigint } }
      const da = sd.delegateAction
      const k = accessKey(da.senderId, pkStr(da.publicKey))
      if (!k) return { Failure: { ActionError: { index: 0, kind: { DelegateActionAccessKeyError: { AccessKeyNotFound: {} } } } } }
      k.nonce = BigInt(da.nonce)
      status = apply(da.senderId, da.receiverId, da.actions)
    }
  }
  return status
}

function sendTx(b64: string) {
  const signed = decodeSignedTransaction(Buffer.from(b64, "base64"))
  const tx = signed.transaction
  const signer = tx.signerId
  const receiver = tx.receiverId
  const k = accessKey(signer, pkStr(tx.publicKey))
  if (!k) throw new RpcFail("INVALID_TRANSACTION", "InvalidAccessKeyError", { InvalidTxError: { InvalidAccessKeyError: { AccessKeyNotFound: {} } } })
  if (BigInt(tx.nonce) <= k.nonce) throw new RpcFail("INVALID_TRANSACTION", "InvalidNonce", { TxExecutionError: { InvalidTxError: { InvalidNonce: { tx_nonce: Number(tx.nonce), ak_nonce: Number(k.nonce) } } } })
  k.nonce = BigInt(tx.nonce)
  const hash = base58.encode(createHash("sha256").update(encodeTransaction(tx)).digest())
  const status = apply(signer, receiver, tx.actions as unknown as Act[])
  const r1 = rid()
  const outcome = {
    final_execution_status: "EXECUTED_OPTIMISTIC",
    status: "Failure" in status ? { Failure: status.Failure } : { SuccessValue: (status.SuccessValue as string) ?? "" },
    transaction: { hash, signer_id: signer, receiver_id: receiver, nonce: Number(tx.nonce), public_key: pkStr(tx.publicKey) },
    transaction_outcome: {
      id: hash,
      block_hash: blockHash(),
      outcome: { logs: [], receipt_ids: [r1], gas_burnt: 2_428_000_000_000, tokens_burnt: "242800000000000000000", executor_id: signer, status: { SuccessReceiptId: r1 } },
    },
    receipts_outcome: [
      { id: r1, block_hash: blockHash(), outcome: { logs: [], receipt_ids: [], gas_burnt: 3_000_000_000_000, tokens_burnt: "300000000000000000000", executor_id: receiver, status } },
    ],
  }
  txs.set(hash, outcome)
  return outcome
}

function handle(method: string, params: Record<string, unknown>): unknown {
  if (method === "block") return { header: { height, hash: blockHash(), timestamp_nanosec: `${Date.now()}000000`, prev_hash: blockHash() }, chunks: [] }
  if (method === "status") return { sync_info: { latest_block_height: height, latest_block_hash: blockHash() }, chain_id: "testnet" }
  if (method === "gas_price") return { gas_price: "100000000" }
  if (method === "query") {
    const rt = params.request_type
    const account = String(params.account_id)
    if (rt === "view_account") {
      const a = accounts.get(account)
      if (!a) throw new RpcFail("UNKNOWN_ACCOUNT", `account ${account} does not exist while viewing`, { requested_account_id: account, block_height: height })
      return { amount: a.amount.toString(), locked: "0", code_hash: "11111111111111111111111111111111", storage_usage: 182, storage_paid_at: 0, block_height: height, block_hash: blockHash() }
    }
    if (rt === "view_access_key") {
      const k = accessKey(account, String(params.public_key))
      if (!k) throw new RpcFail("UNKNOWN_ACCESS_KEY", `access key ${String(params.public_key)} does not exist while viewing`, { public_key: params.public_key, block_height: height })
      return { nonce: Number(k.nonce), permission: k.permission, block_height: height, block_hash: blockHash() }
    }
    if (rt === "view_access_key_list") {
      const a = accounts.get(account)
      if (!a) throw new RpcFail("UNKNOWN_ACCOUNT", "does not exist", { block_height: height })
      return { keys: [...a.keys].map(([public_key, k]) => ({ public_key, access_key: { nonce: Number(k.nonce), permission: k.permission } })), block_height: height }
    }
    if (rt === "call_function") {
      const args = JSON.parse(Buffer.from(String(params.args_base64 ?? ""), "base64").toString("utf8") || "{}")
      return { result: json(view(account, String(params.method_name), args)), logs: [], block_height: height, block_hash: blockHash() }
    }
  }
  if (method === "send_tx" || method === "broadcast_tx_commit") return sendTx(String(params.signed_tx_base64 ?? (params as unknown as string[])[0]))
  if (method === "tx" || method === "EXPERIMENTAL_tx_status") {
    const o = txs.get(String(params.tx_hash))
    if (!o) throw new RpcFail("UNKNOWN_TRANSACTION", "unknown tx")
    return o
  }
  throw new RpcFail("METHOD_NOT_FOUND", method)
}

async function main() {
  // a fresh, migrated schema for the app server
  const admin = new Pool({ connectionString: TEST_DB, max: 1 })
  await admin.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`)
  await admin.query(`CREATE SCHEMA "${SCHEMA}"`)
  await admin.query(`SET search_path TO "${SCHEMA}"`)
  for (const stmt of migrationStatements(SCHEMA)) await admin.query(stmt)
  await admin.end()

  await startFakeIssuer({ port: ISSUER_PORT, clientId: process.env.NEXT_PUBLIC_NEAR_AUTH_CLIENT_ID ?? "e2e-client" })

  createServer((req, res) => {
    res.setHeader("access-control-allow-origin", "*")
    res.setHeader("access-control-allow-headers", "content-type, authorization")
    res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS")
    if (req.method === "OPTIONS") return void res.writeHead(204).end()
    const u = new URL(req.url ?? "/", "http://x")
    if (u.pathname === "/health") return void res.writeHead(200).end("ok")
    if (u.pathname === "/__state") {
      const a = accounts.get(u.searchParams.get("account") ?? "")
      res.writeHead(200, { "content-type": "application/json" })
      return void res.end(JSON.stringify({ exists: !!a, keys: a ? [...a.keys.keys()] : [], registered: registered.has(u.searchParams.get("account") ?? ""), mpc: MPC_PK }))
    }
    let body = ""
    req.on("data", (c) => (body += c))
    req.on("end", () => {
      res.setHeader("content-type", "application/json")
      if (u.pathname === "/__control") {
        const c = JSON.parse(body || "{}") as { op: string; id: string; keys?: string[] }
        if (c.op === "account") accounts.set(c.id, { amount: 1n * NEAR, keys: new Map((c.keys ?? []).map((k) => [k, { nonce: 1n, permission: "FullAccess" }])) })
        return void res.end(JSON.stringify({ ok: true }))
      }
      let id: unknown = null
      try {
        const msg = JSON.parse(body) as { id: unknown; method: string; params: Record<string, unknown> }
        id = msg.id
        const result = handle(msg.method, msg.params ?? {})
        res.end(JSON.stringify({ jsonrpc: "2.0", id, result }))
      } catch (e) {
        const f = e instanceof RpcFail ? e : new RpcFail("INTERNAL_ERROR", String(e))
        res.end(JSON.stringify({ jsonrpc: "2.0", id, error: { name: "HANDLER_ERROR", code: -32000, message: "Server error", data: Object.keys(f.info).length ? f.info : f.message, cause: { name: f.cause_, info: f.info } } }))
      }
    })
  }).listen(RPC_PORT, "127.0.0.1", () => console.log(`fake chain on ${RPC_PORT}, fake issuer on ${ISSUER_PORT}, schema ${SCHEMA}`))
}

void main()
