// Shared script environment: the preview account map, env loading, RPC views, small helpers.
// Testnet only: every script refuses to run when NEXT_PUBLIC_NETWORK says mainnet.
import { existsSync, readFileSync } from "node:fs"

export const WEB_DIR = new URL("../../apps/web/", import.meta.url)
export const KEYS_FILE = new URL(".keys/preview.env", WEB_DIR)
export const ENV_LOCAL = new URL(".env.local", WEB_DIR)

/** The preview root (notes/deploy.md). Override with POT_ROOT for another environment. */
export const ROOT = process.env.POT_ROOT ?? "potprev.testnet"
export const IDS = {
  root: ROOT,
  hub: `pots.${ROOT}`,
  usdc: `usdc.${ROOT}`,
  relayer: `users.${ROOT}`,
  treasury: `treasury.${ROOT}`,
  reserve: `reserve.${ROOT}`,
} as const
export const DAO_CODE_HASH = "Ea8tHXFSQVszVwGASyzAfLq65DjcRDhkfab4FcPaRpgD" // testnet global Sputnik 278adc7 (D-03)
export const RPC_URL = "https://rpc.testnet.fastnear.com"
export const EXPLORER = "https://testnet.nearblocks.io"
export const NEAR = 10n ** 24n

export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue
    const i = line.indexOf("=")
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  return out
}

/** Loads apps/web/.env.local, then apps/web/.keys/preview.env, without overriding the process env. */
export function loadEnv(): void {
  for (const f of [ENV_LOCAL, KEYS_FILE]) {
    if (!existsSync(f)) continue
    for (const [k, v] of Object.entries(parseEnvFile(readFileSync(f, "utf8")))) if (process.env[k] === undefined) process.env[k] = v
  }
  if (process.env.NEXT_PUBLIC_NETWORK === "mainnet") throw new Error("scripts/ are testnet-only")
}

// ---------------------------------------------------------------------------------------------
// read-only RPC (FastNEAR; never rpc.testnet.near.org, D-32)

/** FastNEAR first, dRPC as the failover (CLAUDE.md RPC rule). One laptop IP running live tests, Playwright
 *  and a script at once gets FastNEAR 429s; without a failover a script's reads fail for whole seconds
 *  (QA 2026-10-22: e2e-chain's "Pot holds $450" read timed out while the chain already showed $450). */
export const RPC_URLS = [RPC_URL, "https://near-testnet.drpc.org"] as const

type RpcBody<T> = { result?: T; error?: { code?: number; cause?: { name?: string }; data?: unknown; message?: string } }

/** A transport-level problem (rate limit, 5xx, network, non-JSON body): worth trying the next URL. */
class RpcTransportError extends Error {}

export async function rpc<T>(
  method: string,
  params: unknown,
  opts: { urls?: readonly string[]; fetch?: typeof fetch; rounds?: number; backoffMs?: number } = {},
): Promise<T> {
  const urls = opts.urls ?? RPC_URLS
  const doFetch = opts.fetch ?? fetch
  const rounds = opts.rounds ?? 4
  let last: unknown
  for (let round = 0; round < rounds; round++) {
    for (const url of urls) {
      let j: RpcBody<T>
      try {
        const res = await doFetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        })
        if (res.status === 408 || res.status === 429 || res.status >= 500) throw new RpcTransportError(`${url}: HTTP ${res.status}`)
        j = (await res.json().catch(() => {
          throw new RpcTransportError(`${url}: not JSON`)
        })) as RpcBody<T>
        if (j.error && (j.error.code === -429 || /rate|too many/i.test(String(j.error.message ?? j.error.cause?.name ?? ""))))
          throw new RpcTransportError(`${url}: JSON-RPC rate limit`)
      } catch (e) {
        last = e
        continue // next URL (network errors are TypeErrors from fetch)
      }
      if (j.error) throw Object.assign(new Error(`${method}: ${j.error.cause?.name ?? j.error.message} ${JSON.stringify(j.error.data ?? "")}`), { cause: j.error.cause })
      return j.result as T
    }
    await sleep((opts.backoffMs ?? 500) * (round + 1))
  }
  throw Object.assign(new Error(`${method}: every RPC failed (${String((last as Error)?.message ?? last)})`), { cause: last })
}

export async function view<T>(contract: string, method: string, args: Record<string, unknown> = {}): Promise<T> {
  const r = await rpc<{ result: number[] }>("query", {
    request_type: "call_function",
    finality: "optimistic",
    account_id: contract,
    method_name: method,
    args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
  })
  return JSON.parse(Buffer.from(r.result).toString("utf8")) as T
}

export async function account(id: string): Promise<{ amount: string; locked: string; storage_usage: number; code_hash: string } | null> {
  try {
    return await rpc("query", { request_type: "view_account", finality: "optimistic", account_id: id })
  } catch (e) {
    if ((e as { cause?: { name?: string } }).cause?.name === "UNKNOWN_ACCOUNT") return null
    throw e
  }
}

export async function accessKeys(id: string): Promise<{ public_key: string; access_key: { nonce: number; permission: unknown } }[]> {
  try {
    const r = await rpc<{ keys: { public_key: string; access_key: { nonce: number; permission: unknown } }[] }>("query", {
      request_type: "view_access_key_list",
      finality: "optimistic",
      account_id: id,
    })
    return r.keys
  } catch (e) {
    if ((e as { cause?: { name?: string } }).cause?.name === "UNKNOWN_ACCOUNT") return []
    throw e
  }
}

/** Poll a read until `ok` (RPC nodes behind one URL lag each other by a block or two). */
export async function eventually<T>(read: () => Promise<T>, ok: (v: T) => boolean, ms = 20_000): Promise<T> {
  const end = Date.now() + ms
  for (;;) {
    let err: unknown
    const v = await read().catch((e) => ((err = e), undefined as T))
    if (v !== undefined && ok(v)) return v
    if (Date.now() > end) {
      // say why the wait ended, so a timed-out assertion isn't a mystery
      console.error(`[eventually] gave up after ${ms} ms; last value ${String(v)}${err ? `, last error ${String((err as Error).message ?? err)}` : ""}`)
      return v
    }
    await sleep(700)
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
export const near = (yocto: string | bigint) => (Number(BigInt(yocto) / 10n ** 18n) / 1e6).toFixed(4)
export const usd = (micro: string | bigint) => `$${(Number(BigInt(micro)) / 1e6).toFixed(2)}`
export const txUrl = (h: string) => `${EXPLORER}/txns/${h}`

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
/** base58 (bitcoin alphabet), e.g. to compare a wasm's sha256 with view_account.code_hash. */
export function base58(bytes: Uint8Array): string {
  let n = BigInt(`0x${Buffer.from(bytes).toString("hex") || "0"}`)
  let out = ""
  while (n > 0n) {
    out = B58[Number(n % 58n)] + out
    n /= 58n
  }
  for (const b of bytes) {
    if (b !== 0) break
    out = `1${out}`
  }
  return out
}
