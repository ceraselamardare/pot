// POST /api/session/wallet (B-10; api-spec §2.1, §4.4; D-20, D-23): "I have a NEAR wallet". The wallet signs
// "Sign in to Pot" (NEP-413) during `connector.connect({signMessageParams})`; the server rebuilds the payload,
// verifies the signature, checks that the key is a FULL-ACCESS key of the account (a function-call key can't
// attach the 1 yocto contributions need), refuses our own accounts (everything under <root>), then opens a
// `wallet` session. APP-2 (security audit 2026-11-04): sign-in no longer pays the USDC registration; it happens lazily
// when the account first needs to receive money (creating or joining a Pot, a spend to itself, a close payout), through
// server/features/registration.ts with per-IP and global budgets.
import "server-only"
import { eq } from "drizzle-orm"
import type { Db } from "@/db/client"
import { chargeQuotas, nextUtcDay } from "@/db/quota"
import { appUser, TINTS } from "@/db/schema"
import { viewAccessKey, viewFunction } from "../../chain/near"
import { RpcUnavailableError, type RpcClient } from "../../chain/rpc"
import type { Submitter } from "../../chain/submitter"
import type { Config } from "../../config"
import { ApiError, unavailable } from "../../http/errors"
import { limit } from "../../quotas"
import { hintCookie, sessionCookie } from "../../session/cookies"
import { spendProof } from "../../session/pop"
import { createSession, hintFor, sessionInfo } from "../../session/store"
import { sha256Hex } from "../../util/crypto"
import { isAccountId } from "../../util/ids"
import { cleanDisplayName } from "../../util/text"
import { fromBase64, nonceTime, SIGN_IN_MESSAGE, verifyNep413 } from "./nep413"

export interface WalletDeps {
  db: Db
  rpc: RpcClient
  submitter: Submitter
  cfg: Config
  defer: (fn: () => Promise<void>) => void
  now?: () => number
}

export interface WalletSessionBody {
  accountId: string
  publicKey: string
  signature: string
  nonce: string
  message: string
  recipient: string
}

const NONCE_WINDOW_MS = 5 * 60_000

/** The project root (`potprev.testnet` for hub `pots.potprev.testnet`): no wallet session for anything under it. */
export function rootOf(cfg: Config): string {
  const i = cfg.hubId.indexOf(".")
  return i > 0 ? cfg.hubId.slice(i + 1) : cfg.hubId
}

/**
 * The hosts a NEP-413 `recipient` may name. APP-7: this deployment's own hosts only (`cfg.signInHosts`), not every
 * origin the CSRF check allows: a preview never accepts a signature addressed to production, or the other way round.
 */
export function allowedRecipients(cfg: Config): string[] {
  return cfg.signInHosts
}

const tintFor = (account: string) => TINTS[parseInt(sha256Hex(account).slice(0, 8), 16) % TINTS.length]!

/** "alice.testnet" → "Alice"; implicit (64-hex) or odd names → "Friend". */
export function walletDisplayName(accountId: string): string {
  const first = accountId.split(".")[0] ?? ""
  if (!first || /^[0-9a-f]{64}$/.test(accountId) || /^0x/.test(first)) return "Friend"
  const pretty = first.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 40)
  const r = cleanDisplayName(pretty)
  return r.ok ? r.value : "Friend"
}

export async function walletLogin(
  deps: WalletDeps,
  body: WalletSessionBody,
  meta: { ipHash: string; userAgent: string | null; origin?: string | null },
): Promise<{ status: number; body: Record<string, unknown>; cookies: string[] }> {
  const { db, cfg, rpc } = deps
  const now = deps.now?.() ?? Date.now()
  const bad = (field: string, why?: string) => new ApiError("bad_request", { detail: { field, ...(why ? { why } : {}) } })

  if (!isAccountId(body.accountId)) throw bad("accountId")
  if (body.message !== SIGN_IN_MESSAGE) throw bad("message")
  if (!allowedRecipients(cfg).includes(body.recipient)) throw bad("recipient")
  // APP-7: and the page that asked for it is the one it was signed for (the browser's Origin, already CSRF-checked)
  if (meta.origin !== undefined && (!meta.origin || hostOf(meta.origin) !== body.recipient)) throw bad("recipient", "origin")
  // rev4: never for our own accounts (NEAR Auth users, the hub/token/relayer/treasury)
  const root = rootOf(cfg)
  if (body.accountId === root || body.accountId.endsWith(`.${root}`)) throw bad("accountId", "own_account")

  let nonce: Uint8Array
  try {
    nonce = fromBase64(body.nonce)
  } catch {
    throw bad("nonce")
  }
  if (nonce.length !== 32) throw bad("nonce")
  if (Math.abs(now - nonceTime(nonce)) > NONCE_WINDOW_MS) throw new ApiError("wallet_signature_invalid", { detail: { cause: "nonce_time" } })

  // signature first (free), then spend the nonce, so nobody can burn another person's nonce with junk
  if (!verifyNep413({ message: body.message, nonce, recipient: body.recipient, callbackUrl: null }, body.signature, body.publicKey))
    throw new ApiError("wallet_signature_invalid", { detail: { cause: "signature" } })
  if (!(await spendProof(db, "wallet", sha256Hex(`wallet|${body.nonce}`))))
    throw new ApiError("wallet_signature_invalid", { detail: { cause: "replay" } })

  const ipq = await chargeQuotas(db, [{ subject: `ip:${meta.ipHash}`, action: "wallet_sessions", amount: 1n, limit: limit("ip_session_create") * 10n }])
  if (!ipq.ok) throw new ApiError("rate_limited", { retryAfterMs: nextUtcDay().getTime() - now })

  let key
  try {
    key = await viewAccessKey(rpc, body.accountId, body.publicKey, "final")
  } catch (e) {
    if (e instanceof RpcUnavailableError) throw unavailable("rpc", 3_000)
    throw e
  }
  if (!key || key.permission !== "FullAccess") throw new ApiError("wallet_key_not_full_access")

  // upsert the user (the account is the identity)
  let user = (await db.select().from(appUser).where(eq(appUser.nearAccount, body.accountId)).limit(1))[0]
  let isNew = false
  if (user && user.kind !== "wallet") throw bad("accountId", "own_account")
  if (!user) {
    // APP-1: free wallet accounts are free sybils; at most `ip_signups` new people per IP per day
    const signup = await chargeQuotas(db, [{ subject: `ip:${meta.ipHash}`, action: "signups", amount: 1n, limit: limit("ip_signups") }])
    if (!signup.ok)
      throw new ApiError("quota_exceeded", {
        detail: { family: "accounts", limit: signup.failed.limit.toString(), resetsAt: nextUtcDay().toISOString() },
      })
    const inserted = await db
      .insert(appUser)
      .values({
        kind: "wallet",
        nearAccount: body.accountId,
        displayName: walletDisplayName(body.accountId),
        avatarTint: tintFor(body.accountId),
        onboardState: "ready",
      })
      .onConflictDoNothing({ target: appUser.nearAccount })
      .returning()
    isNew = !!inserted[0]
    user = inserted[0] ?? (await db.select().from(appUser).where(eq(appUser.nearAccount, body.accountId)).limit(1))[0]!
  }

  // USDC registration (D-23): only read here, to keep the flag right. APP-2: never paid at sign-in any more (it drained
  // NEAR and a shared counter for every throwaway account); see server/features/registration.ts for when it is paid.
  const registered = cfg.usdcId
    ? !!(await viewFunction<unknown>(rpc, cfg.usdcId, "storage_balance_of", { account_id: body.accountId }).catch(() => "unknown"))
    : false
  if (registered && !user.usdcRegistered) await db.update(appUser).set({ usdcRegistered: true }).where(eq(appUser.id, user.id))

  const s = await createSession(db, { userId: user.id, kind: "wallet", ipHash: meta.ipHash, userAgent: meta.userAgent })
  const info = sessionInfo({ kind: "wallet", user: { ...user, usdcRegistered: registered }, device: null, expiresAt: s.expiresAt })
  return {
    status: 200,
    cookies: [sessionCookie(cfg, s.cookieValue), hintCookie(cfg, hintFor(info))],
    body: { session: info, isNew, usdcRegistered: registered },
  }
}

const hostOf = (origin: string): string | null => {
  try {
    return new URL(origin).host
  } catch {
    return null
  }
}
