// POST /api/devices (B-13; api-spec §2.2, D-21): "Confirm it's you" on a new phone. The NEAR Auth approval
// popup returns a 60 s signing JWT whose `fatxn` is the exact NEP-461-prefixed DelegateAction
// `AddKey(newDevicePk, FullAccess)` on the person's own account, signed by their MPC key. Everything that is free
// is checked first (PoP, JWT, bytes, delegate shape, chain window, quotas, the MPC key derivation); then the
// relayer calls `fast-auth.<net>.sign` (300 Tgas, 1 yocto, D-21: refunded on every path), wraps the returned
// Ed25519 signature into a SignedDelegate, checks it locally and relays it (policy row R12).
import "server-only"
import { and, eq } from "drizzle-orm"
import { actions as nearActions } from "near-api-js"
import type { JWTVerifyGetKey } from "jose"
import type { Db } from "@/db/client"
import { claimNamedLease, releaseLease } from "@/db/lease"
import { adjustQuota, chargeQuotas, nextUtcDay } from "@/db/quota"
import { device, relayLog, session } from "@/db/schema"
import { relayerAvailable, sponsorAllows, sponsorLevel } from "../../chain/balance"
import { block, viewAccessKey, viewAccessKeyList, type FinalOutcome } from "../../chain/near"
import { burnt, failureText, firstFailure, statusFailure } from "../../chain/outcome"
import type { RpcClient } from "../../chain/rpc"
import type { Submitter } from "../../chain/submitter"
import type { Config } from "../../config"
import { ApiError, errBody, unavailable } from "../../http/errors"
import { limit } from "../../quotas"
import { decodeSignedDelegate, verifyDelegateSignature, type DecodedDelegate } from "../../relay/decode"
import { deriveMpcKey } from "../../session/service"
import { popMessages, verifyPop, type Pop } from "../../session/pop"
import { hintCookie } from "../../session/cookies"
import { hintFor, sessionInfo, type SessionCtx } from "../../session/store"
import { newRelayId, sha256Hex } from "../../util/crypto"
import { guardIdOf, verifySigningJwt } from "../nearauth/signing"

export interface DevicesDeps {
  db: Db
  rpc: RpcClient
  submitter: Submitter
  cfg: Config
  jwks?: JWTVerifyGetKey
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

export interface DevicesBody {
  guardId: string
  verifyPayload: string
  /** base64 of the NEP-461-prefixed DelegateAction bytes */
  signPayload: string
  devicePublicKey: string
  keyKind: "webcrypto" | "fallback"
  pop: Pop
  idempotencyKey: string
}

/** NEP-461 prefix for NEP-366 delegate actions: u32_le(2³⁰ + 366) = 6e 01 00 40. */
export const NEP461_PREFIX = new Uint8Array([0x6e, 0x01, 0x00, 0x40])
export const MAX_SIGN_PAYLOAD = 1400
/** zero-balance accounts fit ≈ 8 full-access keys; keep 2 spare (api-spec R12) */
export const MAX_DEVICE_KEYS = 6
const TGAS = 1_000_000_000_000n
const MPC_SLOTS = 2

/** The DelegateAction inside a signPayload, decoded with the relayer's strict canonical decoder. */
export function decodeSignPayload(bytes: Uint8Array): DecodedDelegate {
  if (bytes.length < 8 || bytes.length > MAX_SIGN_PAYLOAD) throw new ApiError("payload_mismatch", { detail: { cause: "size" } })
  if (!NEP461_PREFIX.every((b, i) => bytes[i] === b)) throw new ApiError("payload_mismatch", { detail: { cause: "prefix" } })
  // SignedDelegate = DelegateAction ‖ Signature(ed25519 tag 0 ‖ 64 bytes): decode with a placeholder signature
  const withSig = new Uint8Array(bytes.length - 4 + 65)
  withSig.set(bytes.slice(4))
  try {
    return decodeSignedDelegate(Buffer.from(withSig).toString("base64"))
  } catch {
    throw new ApiError("payload_mismatch", { detail: { cause: "decode" } })
  }
}

/** The SignedDelegate bytes once the MPC signature is known (base64 for decodeSignedDelegate). */
export function signedDelegateB64(bytes: Uint8Array, signature: Uint8Array): string {
  const out = new Uint8Array(bytes.length - 4 + 65)
  out.set(bytes.slice(4))
  out[bytes.length - 4] = 0 // KeyType::ED25519
  out.set(signature, bytes.length - 4 + 1)
  return Buffer.from(out).toString("base64")
}

/** `fast-auth.sign`'s final value: {"scheme":"Ed25519","signature":[64 bytes]} (base64 JSON), or null on failure. */
export function mpcSignature(o: FinalOutcome): Uint8Array | null {
  const pick = (b64: string | undefined): Uint8Array | null => {
    if (!b64) return null
    try {
      const j = JSON.parse(Buffer.from(b64, "base64").toString("utf8")) as { scheme?: string; signature?: unknown }
      if (Array.isArray(j?.signature) && j.signature.length === 64 && j.signature.every((x) => Number.isInteger(x) && x >= 0 && x < 256))
        return new Uint8Array(j.signature as number[])
    } catch {
      /* not it */
    }
    return null
  }
  const top = o.status as Record<string, unknown>
  const v = pick(typeof top.SuccessValue === "string" ? top.SuccessValue : undefined)
  if (v) return v
  for (const r of o.receipts_outcome) {
    const s = r.outcome.status as Record<string, unknown>
    const x = pick(typeof s.SuccessValue === "string" ? s.SuccessValue : undefined)
    if (x) return x
  }
  return null
}

const outcomeFailure = (o: FinalOutcome): string | null => {
  const top = o.status as Record<string, unknown>
  if ("Failure" in top) return failureText(top.Failure)
  const f = firstFailure(o)
  return f ? failureText(statusFailure(f.outcome.status)) : null
}

type Result = { status: number; body: Record<string, unknown>; cookies: string[] }

export async function addDevice(deps: DevicesDeps, s: SessionCtx, body: DevicesBody, meta: { requestId: string }): Promise<Result> {
  const { db, cfg, rpc } = deps
  const now = deps.now?.() ?? Date.now()
  // 1. only NEAR Auth sessions hold an MPC key (a wallet session signs with its own wallet)
  if (s.kind !== "near-auth") throw new ApiError("demo_forbidden", { detail: { why: "not_near_auth" } })
  const account = s.user.nearAccount
  const key = `devices:${body.idempotencyKey}`
  const prior = (await db.select().from(relayLog).where(and(eq(relayLog.userId, s.user.id), eq(relayLog.idempotencyKey, key))).limit(1))[0]
  if (prior?.response) {
    const stored = prior.response as Record<string, unknown>
    if (stored.ok === false) {
      const { reason, detail, txHash } = stored as { reason: string; detail?: Record<string, unknown>; txHash?: string }
      throw new ApiError(reason as never, { detail, txHash })
    }
    return { status: prior.httpStatus ?? 200, body: { ...stripEnvelope(stored), replayed: true }, cookies: [] }
  }
  if (prior) throw new ApiError("rate_limited", { retryAfterMs: 3_000, detail: { why: "in_flight" } })

  // 2. the new key proves possession
  if (body.guardId !== guardIdOf(cfg)) throw new ApiError("payload_mismatch", { detail: { cause: "guard" } })
  await verifyPop(db, { purpose: "device_add", message: popMessages.device_add(account, body.pop.ts), publicKey: body.devicePublicKey, pop: body.pop, nowMs: now })
  // 3. the signing JWT binds the exact bytes
  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(Buffer.from(body.signPayload, "base64"))
  } catch {
    throw new ApiError("payload_mismatch", { detail: { cause: "base64" } })
  }
  await verifySigningJwt(body.verifyPayload, cfg, { sub: s.user.authSub ?? "", bytes }, { jwks: deps.jwks, nowMs: now })
  // 4-5. the delegate: AddKey(devicePk, FullAccess) on the own account, signed by the stored MPC key
  const d = decodeSignPayload(bytes)
  const mpcPk = s.user.mpcPublicKey
  const a = d.actions[0]
  if (
    d.senderId !== account ||
    d.receiverId !== account ||
    d.actions.length !== 1 ||
    a?.kind !== "addKey" ||
    !a.fullAccess ||
    a.publicKey !== body.devicePublicKey ||
    !mpcPk ||
    d.publicKey !== mpcPk
  )
    throw new ApiError("payload_mismatch", { detail: { cause: "delegate" } })

  // 6. chain: already on chain → done, nothing paid
  if (await viewAccessKey(rpc, account, body.devicePublicKey, "optimistic")) {
    const r = await activate(deps, s, body, null)
    return r
  }
  const mpcKey = await viewAccessKey(rpc, account, mpcPk, "optimistic")
  if (!mpcKey) throw new ApiError("key_not_found")
  if (d.nonce <= mpcKey.nonce) throw new ApiError("nonce_used")
  const head = await block(rpc, { finality: "final" })
  if (d.maxBlockHeight <= BigInt(head.height + 10)) throw new ApiError("expired")
  if (d.maxBlockHeight > BigInt(head.height + 600)) throw new ApiError("ttl_too_long")
  const keys = await viewAccessKeyList(rpc, account).catch(() => null)
  if (keys && keys.length >= MAX_DEVICE_KEYS + 1) throw new ApiError("quota_exceeded", { detail: { family: "devices", why: "max_keys" } })

  // 7. quotas: 5 devices per user per day, global MPC signs, the yocto pre-charge
  const estYocto = 5_000_000_000_000_000_000_000n // 0.005 NEAR
  const charges = [
    { subject: `user:${s.user.id}`, action: "devices", amount: 1n, limit: 5n },
    { subject: "global", action: "mpc_signs", amount: 1n, limit: limit("global_mpc_signs") },
    { subject: "global", action: "relay_yocto", amount: estYocto, limit: limit("global_relay_yocto") },
  ]
  const q = await chargeQuotas(db, charges)
  if (!q.ok) throw new ApiError("quota_exceeded", { detail: { family: "devices", limit: q.failed.limit.toString(), resetsAt: nextUtcDay().toISOString() } })
  const refund = () => Promise.all(charges.map((c) => adjustQuota(db, [c.subject], c.action, -c.amount))).catch(() => undefined)

  // 7b. rev4 L-7: the derivation for this `sub` must still give the stored key (NEAR Auth's hashed-sub change)
  let derived: string
  try {
    derived = await deriveMpcKey(rpc, cfg, s.user.authSub ?? "")
  } catch (e) {
    await refund()
    throw e
  }
  if (derived !== mpcPk) {
    await refund()
    throw new ApiError("payload_mismatch", { detail: { cause: "mpc_key" } })
  }
  const level = sponsorLevel(await relayerAvailable(rpc, cfg.relayerAccountId), cfg.relayerThresholds)
  if (!sponsorAllows(level, "mpc_sign")) {
    await refund()
    throw unavailable("sponsor_low", 60_000)
  }

  // 8. an MPC slot (≤ 2 concurrent signs), the relay_log rows
  const holder = newRelayId()
  let slot: string | null = null
  for (let i = 0; i < MPC_SLOTS && !slot; i++) if (await claimNamedLease(db, `mpc_slot:${i}`, holder, 60)) slot = `mpc_slot:${i}`
  if (!slot) {
    await refund()
    throw new ApiError("mpc_busy", { retryAfterMs: 5_000 })
  }
  const signRowId = holder
  try {
    await db.insert(relayLog).values({
      id: signRowId,
      requestId: meta.requestId,
      userId: s.user.id,
      idempotencyKey: key,
      bodyHash: sha256Hex(body.signPayload),
      op: "mpc_sign",
      intent: "add_device_key",
      senderId: cfg.relayerAccountId,
      receiverId: cfg.mpc.predecessor,
      methods: ["sign"],
      delegateHash: null,
      delegatePublicKey: d.publicKey,
      delegateNonce: d.nonce.toString(),
      maxBlockHeight: Number(d.maxBlockHeight),
      status: "validated",
      estYocto: estYocto.toString(),
    })
  } catch {
    await releaseLease(db, slot, holder)
    await refund()
    throw new ApiError("rate_limited", { retryAfterMs: 3_000, detail: { why: "in_flight" } })
  }

  const fail = async (e: ApiError) => {
    await db
      .update(relayLog)
      .set({ status: "failed", reason: e.reason, response: errBody(e, meta.requestId), httpStatus: e.status, finishedAt: new Date() })
      .where(eq(relayLog.id, signRowId))
    throw e
  }

  try {
    // 9. fast-auth.sign: 300 Tgas, MPC_SIGN_DEPOSIT_YOCTO (1 yocto)
    const signRes = await deps.submitter.submit(
      {
        signerId: cfg.relayerAccountId,
        receiverId: cfg.mpc.predecessor,
        actions: [
          nearActions.functionCall(
            "sign",
            { guard_id: body.guardId, verify_payload: body.verifyPayload, sign_payload: Array.from(bytes), algorithm: "eddsa" },
            300n * TGAS,
            cfg.mpc.signDepositYocto,
          ),
        ],
      },
      {
        pool: cfg.relayerPool,
        holder: signRowId,
        budgetMs: 30_000,
        leaseTtlSec: 60,
        onSigned: async ({ txHash, publicKey }) => {
          await db.update(relayLog).set({ status: "signed", outerTxHash: txHash, relayerKey: publicKey, submittedAt: new Date() }).where(eq(relayLog.id, signRowId))
        },
      },
    )
    if (signRes.kind === "pending") return await fail(new ApiError("mpc_sign_failed", { txHash: signRes.txHash, detail: { cause: "timeout" } }))
    // 10. the signature
    const sig = mpcSignature(signRes.outcome)
    await db
      .update(relayLog)
      .set({ status: sig ? "executed" : "failed", outcome: sig ? "success" : "inner_failed", costYocto: (burnt(signRes.outcome).yocto + 1n).toString() })
      .where(eq(relayLog.id, signRowId))
    if (!sig) return await fail(new ApiError("mpc_sign_failed", { txHash: signRes.txHash, message: outcomeFailure(signRes.outcome) ?? "null signature" }))

    // 11. wrap into a SignedDelegate, check it locally, relay it (R12)
    const signed = decodeSignedDelegate(signedDelegateB64(bytes, sig))
    if (!(await verifyDelegateSignature(signed))) return await fail(new ApiError("mpc_sign_failed", { txHash: signRes.txHash, detail: { cause: "bad_signature" } }))
    const addRowId = newRelayId()
    await db.insert(relayLog).values({
      id: addRowId,
      requestId: meta.requestId,
      userId: s.user.id,
      op: "add_key",
      intent: "add_device_key",
      senderId: account,
      receiverId: account,
      methods: ["AddKey"],
      delegateHash: signed.hash,
      delegatePublicKey: signed.publicKey,
      delegateNonce: signed.nonce.toString(),
      maxBlockHeight: Number(signed.maxBlockHeight),
      status: "validated",
    })
    const addRes = await deps.submitter.submit(
      {
        signerId: cfg.relayerAccountId,
        receiverId: account,
        actions: [nearActions.signedDelegate(signed.raw as unknown as Parameters<typeof nearActions.signedDelegate>[0])],
      },
      {
        pool: cfg.relayerPool,
        holder: addRowId,
        budgetMs: 20_000,
        onSigned: async ({ txHash, publicKey }) => {
          await db.update(relayLog).set({ status: "signed", outerTxHash: txHash, relayerKey: publicKey, submittedAt: new Date() }).where(eq(relayLog.id, addRowId))
        },
      },
    )
    if (addRes.kind === "outcome") {
      const f = outcomeFailure(addRes.outcome)
      await db
        .update(relayLog)
        .set({ status: f ? "failed" : "executed", outcome: f ? "inner_failed" : "success", errorText: f, costYocto: burnt(addRes.outcome).yocto.toString(), finishedAt: new Date() })
        .where(eq(relayLog.id, addRowId))
      if (f) return await fail(new ApiError("mpc_sign_failed", { txHash: addRes.txHash, message: f }))
    } else {
      await db.update(relayLog).set({ status: "pending" }).where(eq(relayLog.id, addRowId))
    }
    // the key must be visible before the client signs with it (≤ 10 s)
    const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)))
    for (let i = 0; i < 20 && !(await viewAccessKey(rpc, account, body.devicePublicKey, "optimistic").catch(() => null)); i++) await sleep(500)
    const head2 = await block(rpc, { finality: "optimistic" }).catch(() => ({ height: 0 }))
    const r = await activate(deps, s, body, { signTxHash: signRes.txHash, addKeyTxHash: addRes.txHash, executedAtBlock: head2.height })
    await db
      .update(relayLog)
      .set({ response: { ok: true, requestId: meta.requestId, ...r.body }, httpStatus: 200, finishedAt: new Date() })
      .where(eq(relayLog.id, signRowId))
    return r
  } catch (e) {
    if (e instanceof ApiError) throw e
    return await fail(new ApiError("internal", { message: String(e).slice(0, 200) }))
  } finally {
    await releaseLease(db, slot, holder).catch(() => undefined)
  }
}

/** 12. the device row active, the session rebound to it, the hint cookie re-issued. */
async function activate(
  deps: DevicesDeps,
  s: SessionCtx,
  body: DevicesBody,
  txs: { signTxHash: string; addKeyTxHash: string; executedAtBlock: number } | null,
): Promise<Result> {
  const { db, cfg } = deps
  const existing = (await db.select().from(device).where(eq(device.publicKey, body.devicePublicKey)).limit(1))[0]
  if (existing && existing.userId !== s.user.id) throw new ApiError("bad_request", { detail: { field: "devicePublicKey", why: "in_use" } })
  let devId: string
  if (existing) {
    await db
      .update(device)
      .set({ status: "active", activatedAt: new Date(), addedVia: existing.addedVia ?? "near_auth", addKeyTxHash: txs?.addKeyTxHash ?? existing.addKeyTxHash })
      .where(eq(device.id, existing.id))
    devId = existing.id
  } else {
    const [row] = await db
      .insert(device)
      .values({
        userId: s.user.id,
        publicKey: body.devicePublicKey,
        keyKind: body.keyKind,
        status: "active",
        addedVia: "near_auth",
        addKeyTxHash: txs?.addKeyTxHash ?? null,
        activatedAt: new Date(),
      })
      .returning()
    devId = row!.id
  }
  await db.update(session).set({ deviceId: devId }).where(eq(session.idHash, s.idHash))
  const dev = (await db.select().from(device).where(eq(device.id, devId)).limit(1))[0]!
  const info = sessionInfo({ kind: "near-auth", user: s.user, device: dev, expiresAt: s.expiresAt })
  const executedAtBlock = txs?.executedAtBlock ?? (await block(deps.rpc, { finality: "optimistic" }).catch(() => ({ height: 0 }))).height
  return {
    status: 200,
    cookies: [hintCookie(cfg, hintFor(info))],
    body: {
      device: { publicKey: body.devicePublicKey, status: "active" },
      ...(txs ? { signTxHash: txs.signTxHash, addKeyTxHash: txs.addKeyTxHash } : {}),
      executedAtBlock,
      session: info,
    },
  }
}

function stripEnvelope(b: Record<string, unknown>): Record<string, unknown> {
  const { ok: _ok, requestId: _r, ...rest } = b
  void _ok
  void _r
  return rest
}
