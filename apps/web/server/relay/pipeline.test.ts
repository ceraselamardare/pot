// B-03/B-05/B-09 integration: the relay pipeline end to end against pot_test, with real signed delegates,
// a fake chain and a scripted submitter. Covers api-spec §8 "Relayer safety" (A-01), idempotency (A-03),
// quotas and budgets (A-02, A-23), R11 hub-tracked votes (A-22), two-phase request_spend (A-05).
import { vi } from "vitest"
vi.mock("server-only", () => ({}))
import { and, eq, sql } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { readQuota } from "@/db/quota"
import { feedEvent, pot, relayLog } from "@/db/schema"
import { createTestDb, type TestDb } from "@/db/testing"
import { resetBalanceCacheForTests } from "../chain/balance"
import { createHubReader } from "../chain/hub"
import type { Config } from "../config"
import { ApiError } from "../http/errors"
import { DAO, fc, HUB, newKey, signDelegate, USDC } from "../testing/delegates"
import { RELAYER, NEAR, insertUser, seedChain, testConfig } from "../testing/env"
import { event, FakeChain, FakeSubmitter, HEAD, methodOf, panic, plainOutcome, relayedOutcome, valueOf, type Script } from "../testing/fakeChain"
import { relay, type Actor, type RelayDeps } from "./pipeline"
import { getRelay } from "./status"
import { sha256Hex } from "../util/crypto"

let t: TestDb
let cfg: Config
let chain: FakeChain
let sub: FakeSubmitter
let deferred: (() => Promise<void>)[]
let deps: RelayDeps

const USER = "u-maya0001.users.potapp.testnet"
const key = newKey()
let actor: Actor
let reqN = 0

const flush = async () => {
  while (deferred.length) await deferred.shift()!()
}

beforeAll(async () => {
  t = await createTestDb("relay")
})
afterAll(async () => {
  await t.close()
})

function contribution(amount = "150000000") {
  return fc("ft_transfer_call", { receiver_id: HUB, amount, msg: JSON.stringify({ pot: DAO }) }, 100, 1n)
}

const contributedOk = (amount = "150000000"): Script => (spec) =>
  relayedOutcome({
    txHash: "x",
    relayer: RELAYER,
    sender: spec.receiverId,
    inner: {
      executor: USDC,
      logs: [event("nep141", "ft_transfer", [{ old_owner_id: spec.receiverId, new_owner_id: HUB, amount }])],
      children: [
        {
          executor: HUB,
          status: valueOf("0"),
          logs: [event("pot", "contribution", { pot: DAO, member: spec.receiverId, amount, member_total: amount, pot_total: amount })],
        },
      ],
      then: { executor: USDC, status: valueOf(amount) },
    },
  })

async function send(
  actions: ReturnType<typeof fc>[],
  over: { receiver?: string; nonce?: bigint; mbh?: bigint; idem?: string; intent?: string; requestRef?: string; signer?: typeof key; sender?: string; who?: Actor } = {},
) {
  const { b64 } = await signDelegate({
    key: over.signer ?? key,
    sender: over.sender ?? USER,
    receiver: over.receiver ?? USDC,
    actions,
    nonce: over.nonce ?? 1_001n + BigInt(reqN),
    maxBlockHeight: over.mbh ?? BigInt(HEAD + 200),
  })
  const idem = over.idem ?? `k${(reqN++).toString().padStart(15, "0")}`
  const body = { signedDelegate: b64, idempotencyKey: idem, intent: over.intent }
  try {
    return await relay(deps, over.who ?? actor, {
      requestId: `req_${reqN}`,
      signedDelegate: b64,
      idempotencyKey: idem,
      intent: over.intent,
      requestRef: over.requestRef,
      bodyHash: sha256Hex(JSON.stringify(body)),
    })
  } catch (e) {
    if (e instanceof ApiError) return { status: e.status, body: { ok: false, reason: e.reason, detail: e.detail, txHash: e.txHash } }
    throw e
  }
}

beforeEach(async () => {
  await t.truncate()
  for (const k of Object.keys(process.env)) if (k.startsWith("QUOTA_")) delete process.env[k]
  cfg = testConfig({ RELAYER_FLOOR_NEAR: "1", RELAYER_CRITICAL_NEAR: "2", RELAYER_WARN_NEAR: "5" })
  resetBalanceCacheForTests()
  chain = seedChain(new FakeChain())
  chain.account(USER, { keys: { [key.getPublicKey().toString()]: 1_000n } })
  sub = new FakeSubmitter(contributedOk())
  deferred = []
  deps = {
    db: t.db,
    rpc: chain,
    hub: createHubReader(chain, HUB),
    submitter: sub,
    cfg,
    defer: (fn) => deferred.push(fn),
    sleep: async () => undefined,
  }
  const { user } = await insertUser(t.db, { account: USER, key, kind: "near-auth" })
  actor = { userId: user.id, accountId: USER, kind: "near-auth", device: { publicKey: key.getPublicKey().toString(), status: "active" } }
})

describe("success path (R1 contribution)", () => {
  it("relays, classifies from receipts, logs, writes the feed and corrects the yocto pre-charge", async () => {
    const r = await send([contribution()], { intent: "add_money" })
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({
      ok: true,
      outcome: "success",
      final: true,
      result: { type: "contribution", recorded: true, amount: "150000000", usedAmount: "150000000" },
    })
    expect((r.body.events as unknown[]).map((e) => (e as { event: string }).event)).toEqual(["ft_transfer", "contribution"])
    expect(r.body.receiptUrl).toMatch(/^https:\/\/testnet\.nearblocks\.io\/txns\//)
    expect(sub.submitted).toHaveLength(1)
    expect(sub.submitted[0]!.spec).toMatchObject({ signerId: RELAYER, receiverId: USER })
    const row = (await t.db.select().from(relayLog).where(eq(relayLog.id, String(r.body.relayId))))[0]!
    expect(row).toMatchObject({ status: "executed", outcome: "success", op: "relay", intent: "add_money", potId: DAO, httpStatus: 200 })
    expect(row.outerTxHash).toBe(r.body.txHash)
    const feed = await t.db.select().from(feedEvent)
    expect(feed.map((f) => [f.kind, f.key])).toEqual([["contribution", `contribution:${r.body.txHash}`]])
    expect((await t.db.select().from(pot))[0]).toMatchObject({ daoId: DAO, name: "Lisbon Trip" })
    expect(await readQuota(t.db, `user:${actor.userId}`, "contribute")).toBe(1n)
    // pre-charge 0.0012 NEAR corrected to Σ tokens_burnt + 1 yocto
    const cost = BigInt(row.costYocto!)
    expect(await readQuota(t.db, `user:${actor.userId}`, "relay_yocto")).toBe(cost)
    expect(await readQuota(t.db, "global", "relay_yocto")).toBe(cost)
  })

  it("same key + same body → the stored response, replayed; nothing re-submitted (A-03)", async () => {
    const { b64 } = await signDelegate({ key, sender: USER, receiver: USDC, actions: [contribution()], nonce: 5_000n, maxBlockHeight: BigInt(HEAD + 200) })
    const body = { signedDelegate: b64, idempotencyKey: "aaaaaaaaaaaaaaaa" }
    const req = { requestId: "req_1", signedDelegate: b64, idempotencyKey: "aaaaaaaaaaaaaaaa", bodyHash: sha256Hex(JSON.stringify(body)) }
    const first = await relay(deps, actor, req)
    const again = await relay(deps, actor, { ...req, requestId: "req_2" })
    expect(again.status).toBe(200)
    expect(again.body).toMatchObject({ replayed: true, relayId: first.body.relayId, txHash: first.body.txHash })
    expect(sub.submitted).toHaveLength(1)
    // same key, different body → idempotency_conflict
    await expect(relay(deps, actor, { ...req, bodyHash: "different" })).rejects.toMatchObject({ reason: "idempotency_conflict", status: 409 })
    // the same signed delegate under a new key → deduped by delegate_hash
    const dedup = await relay(deps, actor, { ...req, idempotencyKey: "bbbbbbbbbbbbbbbb", requestId: "req_3" })
    expect(dedup.body).toMatchObject({ replayed: true, relayId: first.body.relayId })
    expect(sub.submitted).toHaveLength(1)
  })
})

describe("refused before submission (api-spec §8 Relayer safety)", () => {
  const cases: [string, () => Promise<{ status: number; body: Record<string, unknown> }>, string][] = [
    ["deposit > 1 yocto", () => send([fc("ft_transfer_call", { receiver_id: HUB, amount: "1", msg: JSON.stringify({ pot: DAO }) }, 100, 2n)]), "deposit_cap"],
    ["near_deposit", () => send([fc("near_deposit", {}, 30, 10n ** 22n)], { receiver: "wrap.testnet" }), "method_not_allowed"],
    ["ft_transfer_call to a non-hub receiver", () => send([fc("ft_transfer_call", { receiver_id: "evil.testnet", amount: "1", msg: JSON.stringify({ pot: DAO }) }, 100, 1n)]), "args_invalid"],
    ["300 Tgas ft_transfer_call", () => send([fc("ft_transfer_call", { receiver_id: HUB, amount: "1", msg: JSON.stringify({ pot: DAO }) }, 300, 1n)]), "gas_cap"],
    ["stale max_block_height", () => send([contribution()], { mbh: BigInt(HEAD + 10) }), "expired"],
    ["max_block_height too far", () => send([contribution()], { mbh: BigInt(HEAD + 601) }), "ttl_too_long"],
    ["replayed nonce", () => send([contribution()], { nonce: 1_000n }), "nonce_used"],
    ["unknown receiver", () => send([fc("x", {})], { receiver: "evil.testnet" }), "receiver_not_allowed"],
    ["sender ≠ session account", () => send([contribution()], { sender: "someone.testnet" }), "sender_mismatch"],
    ["a key that isn't the session's device key", () => send([contribution()], { signer: newKey() }), "key_not_allowed"],
    ["any deposit on a hub method", () => send([fc("propose_close", { pot: DAO }, 150, 1n)], { receiver: HUB }), "deposit_cap"],
  ]
  it.each(cases)("%s → %s, no tx, a rejected relay_log row", async (_n, run, reason) => {
    const r = await run()
    expect(r.body.reason).toBe(reason)
    expect(sub.submitted).toHaveLength(0)
    const rows = await t.db.select().from(relayLog)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ status: "rejected", reason, outerTxHash: null, idempotencyKey: null, delegateHash: null })
    expect(await readQuota(t.db, `user:${actor.userId}`, "contribute")).toBe(0n)
  })

  it("tampered bytes → bad_signature", async () => {
    const { bytes } = await signDelegate({ key, sender: USER, receiver: USDC, actions: [contribution("150000000")], nonce: 9_999n, maxBlockHeight: BigInt(HEAD + 100) })
    const s = Buffer.from(bytes).toString("latin1")
    const tampered = Uint8Array.from(bytes)
    tampered[s.indexOf("150000000") + 1] = "9".charCodeAt(0)
    await expect(
      relay(deps, actor, { requestId: "r", signedDelegate: Buffer.from(tampered).toString("base64"), idempotencyKey: "cccccccccccccccc", bodyHash: "h" }),
    ).rejects.toMatchObject({ reason: "bad_signature" })
    expect(sub.submitted).toHaveLength(0)
  })

  it("a key missing on chain → key_not_found", async () => {
    chain.accounts.get(USER)!.keys.clear()
    expect((await send([contribution()])).body.reason).toBe("key_not_found")
  })

  it("a function-call key attaching 1 yocto → fc_key_deposit", async () => {
    chain.accounts.get(USER)!.keys.set(key.getPublicKey().toString(), {
      nonce: 1_000n,
      permission: { FunctionCall: { allowance: null, receiver_id: USDC, method_names: [] } },
    })
    expect((await send([contribution()])).body.reason).toBe("fc_key_deposit")
  })

  it("two delegates for one key in flight → nonce_pending", async () => {
    await t.db.insert(relayLog).values({
      id: "rl_inflight",
      requestId: "x",
      op: "relay",
      senderId: USER,
      receiverId: USDC,
      delegatePublicKey: key.getPublicKey().toString(),
      delegateNonce: "5000",
      status: "submitted",
    })
    const r = await send([contribution()], { nonce: 4_000n })
    expect(r.body.reason).toBe("nonce_pending")
  })

  it("the first delegate of a key added a block ago passes the nonce bound (optimistic head, not final)", async () => {
    // a key added at optimistic block H has nonce (H-1)·10⁶; final lags by 3 blocks
    chain.optimisticHead = HEAD + 3
    const fresh = BigInt(HEAD + 2) * 1_000_000n
    chain.accounts.get(USER)!.keys.set(key.getPublicKey().toString(), { nonce: fresh, permission: "FullAccess" })
    const ok = await send([contribution()], { nonce: fresh + 1n })
    expect(ok.status).toBe(200)
    // beyond the optimistic head + 2 is still too large
    const tooLarge = await send([contribution()], { nonce: BigInt(HEAD + 5) * 1_000_000n })
    expect(tooLarge.body).toMatchObject({ reason: "bad_request", detail: { field: "nonce", why: "too_large" } })
  })

  it("unknown and closed Pots", async () => {
    chain.view(HUB, "get_pot", () => null)
    deps.hub = createHubReader(chain, HUB)
    expect((await send([contribution()])).body.reason).toBe("pot_unknown")
    chain.view(HUB, "get_pot", () => ({ ...{ pot: DAO, slug: "lisbon-trip", name: "L", preset: "trip", status: "closing", member_count: 3 } }))
    deps.hub = createHubReader(chain, HUB)
    const r = await send([contribution()])
    expect(r.body).toMatchObject({ reason: "pot_closed", detail: { status: "closing" } })
  })

  it("relayer below the floor → 503 sponsor_low; critical refuses create_pot only", async () => {
    chain.accounts.get(RELAYER)!.amount = NEAR / 2n
    expect((await send([contribution()])).body).toMatchObject({ reason: "service_unavailable", detail: { cause: "sponsor_low" } })
    resetBalanceCacheForTests()
    chain.accounts.get(RELAYER)!.amount = (3n * NEAR) / 2n
    chain.view(HUB, "get_pot", () => null)
    deps.hub = createHubReader(chain, HUB)
    const create = await send([fc("create_pot", { slug: "new-pot", name: "New Pot", preset: "trip" }, 300)], { receiver: HUB })
    expect(create.body).toMatchObject({ reason: "service_unavailable", detail: { cause: "sponsor_low" } })
  })

  it("create_pot on an existing slug → slug_taken", async () => {
    chain.account(`new-pot.${HUB}`)
    const r = await send([fc("create_pot", { slug: "new-pot", name: "New Pot", preset: "trip" }, 300)], { receiver: HUB })
    expect(r.body.reason).toBe("slug_taken")
  })
})

describe("quotas and budgets (A-02, A-23)", () => {
  it("burst: the 4th write in a minute → rate_limited", async () => {
    process.env.QUOTA_USER_BURST = "3"
    for (let i = 0; i < 3; i++) expect((await send([contribution()])).status).toBe(200)
    const r = await send([contribution()])
    expect(r.body.reason).toBe("rate_limited")
  })

  it("family per day → quota_exceeded with detail.family", async () => {
    process.env.QUOTA_USER_CONTRIBUTE = "1"
    expect((await send([contribution()])).status).toBe(200)
    expect((await send([contribution()])).body).toMatchObject({ reason: "quota_exceeded", detail: { family: "contribute" } })
  })

  it("per-user relay_yocto budget trips before the global cap → family budget", async () => {
    process.env.QUOTA_USER_RELAY_YOCTO = (2n * 10n ** 21n).toString() // 0.002 NEAR
    expect((await send([contribution()])).status).toBe(200)
    expect((await send([contribution()])).body).toMatchObject({ reason: "quota_exceeded", detail: { family: "budget" } })
  })

  it("global relay cap → 503 global_cap", async () => {
    process.env.QUOTA_GLOBAL_RELAYS = "0"
    expect((await send([contribution()])).body).toMatchObject({ reason: "service_unavailable", detail: { cause: "global_cap" } })
    expect(await readQuota(t.db, `user:${actor.userId}`, "contribute")).toBe(0n) // all or nothing
  })

  it("the 4th create_pot in a UTC day → quota_exceeded family create, no tx", async () => {
    process.env.QUOTA_USER_HUB_YOCTO = (3n * 10n ** 23n).toString() // prod's 0.3 NEAR: 3 creations (0.183) fit
    chain.view(HUB, "get_pot", () => null)
    deps.hub = createHubReader(chain, HUB)
    sub.script = () => relayedOutcome({ txHash: "x", relayer: RELAYER, sender: USER, inner: { executor: HUB, status: valueOf({ ok: true, pot: "p", slug: "p" }) } })
    for (let i = 0; i < 3; i++)
      expect((await send([fc("create_pot", { slug: `pot-${i}`, name: "A Pot", preset: "trip" }, 300)], { receiver: HUB })).status).toBe(200)
    const r = await send([fc("create_pot", { slug: "pot-9", name: "A Pot", preset: "trip" }, 300)], { receiver: HUB })
    expect(r.body).toMatchObject({ reason: "quota_exceeded", detail: { family: "create" } })
    expect(sub.submitted).toHaveLength(3)
    expect(await readQuota(t.db, `user:${actor.userId}`, "hub_yocto")).toBe(3n * 61n * 10n ** 21n)
  })

  it("more than 10 on-chain rejections today → user_suspended", async () => {
    for (let i = 0; i < 11; i++)
      await t.db.insert(relayLog).values({ id: `rl_f${i}`, requestId: "x", userId: actor.userId, op: "relay", receiverId: USDC, status: "failed", outcome: "delegate_failed" })
    expect((await send([contribution()])).body.reason).toBe("user_suspended")
  })

  it("wallet actors (no device binding: any full-access key of the account) are charged per user from relay_yocto", async () => {
    const wallet: Actor = { ...actor, kind: "wallet", device: null }
    const r = await send([contribution()], { who: wallet })
    expect(r.status).toBe(200)
    expect(await readQuota(t.db, `user:${actor.userId}`, "contribute")).toBe(1n)
    expect(await readQuota(t.db, "global", "relay_yocto")).toBeGreaterThan(0n)
    expect(await readQuota(t.db, `user:${actor.userId}`, "relay_yocto")).toBeGreaterThan(0n)
  })
})

describe("on-chain outcomes", () => {
  it("inner failure → 200 inner_failed with the hub's ERR code (money refunded)", async () => {
    sub.script = (spec) =>
      relayedOutcome({
        txHash: "x",
        relayer: RELAYER,
        sender: spec.receiverId,
        inner: {
          executor: USDC,
          children: [{ executor: HUB, status: panic("ERR_POT_NOT_OPEN") }],
          then: { executor: USDC, status: valueOf("0") },
        },
      })
    const r = await send([contribution()])
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ outcome: "inner_failed", errorCode: "ERR_POT_NOT_OPEN", result: { recorded: false, usedAmount: "0" } })
    expect(await t.db.select().from(feedEvent)).toHaveLength(0)
  })

  it("ft_transfer_call panics in the token (not registered) → RECEIVER_NOT_REGISTERED", async () => {
    sub.script = (spec) =>
      relayedOutcome({ txHash: "x", relayer: RELAYER, sender: spec.receiverId, inner: { executor: USDC, status: panic("The account u-x is not registered") } })
    expect((await send([contribution()])).body).toMatchObject({ outcome: "inner_failed", errorCode: "RECEIVER_NOT_REGISTERED" })
  })

  it("delegate-level failure → 409 nonce_used with txHash; counts as delegate_failed", async () => {
    sub.script = (spec) =>
      relayedOutcome({
        txHash: "x",
        relayer: RELAYER,
        sender: spec.receiverId,
        inner: { executor: USDC },
        top: { ActionError: { index: 0, kind: { DelegateActionInvalidNonce: { ak_nonce: 5, delegate_nonce: 5 } } } },
      })
    const r = await relay(deps, actor, {
      requestId: "r",
      signedDelegate: (await signDelegate({ key, sender: USER, receiver: USDC, actions: [contribution()], nonce: 1_500n, maxBlockHeight: BigInt(HEAD + 100) })).b64,
      idempotencyKey: "dddddddddddddddd",
      bodyHash: "h",
    })
    expect(r.status).toBe(409)
    expect(r.body).toMatchObject({ ok: false, reason: "nonce_used" })
    expect(r.body.txHash).toBeTruthy()
    const row = (await t.db.select().from(relayLog).where(eq(relayLog.idempotencyKey, "dddddddddddddddd")))[0]!
    expect(row).toMatchObject({ status: "failed", outcome: "delegate_failed", reason: "nonce_used" })
  })

  it("expired on chain → 409 expired", async () => {
    sub.script = (spec) =>
      relayedOutcome({ txHash: "x", relayer: RELAYER, sender: spec.receiverId, inner: { executor: USDC }, top: { ActionError: { index: 0, kind: "DelegateActionExpired" } } })
    expect((await send([contribution()])).body.reason).toBe("expired")
  })

  it("outcome unknown at the budget → 202 pending, then GET /api/relay/[id] classifies from tx status", async () => {
    sub.script = () => "pending"
    const r = await send([contribution()])
    expect(r.status).toBe(202)
    expect(r.body).toMatchObject({ status: "pending" })
    const relayId = String(r.body.relayId)
    const row = (await t.db.select().from(relayLog).where(eq(relayLog.id, relayId)))[0]!
    expect(row.status).toBe("pending")
    chain.txs.set(row.outerTxHash!, contributedOk()({ signerId: RELAYER, receiverId: USER, actions: [] }, { pool: "", holder: "" }, 0) as never)
    const g = await getRelay(deps, actor.userId, relayId, "req_get", { pollMs: 1, budgetMs: 1_000 })
    expect(g.status).toBe(200)
    expect(g.body).toMatchObject({ outcome: "success", final: true, result: { type: "contribution", recorded: true } })
    await expect(getRelay(deps, "00000000-0000-0000-0000-000000000000", relayId, "x")).rejects.toMatchObject({ reason: "not_found" })
  })

  it("a broadcast that never landed → GET says 409 expired (lost_broadcast) once the delegate can't run; pre-charge back", async () => {
    sub.script = () => "pending"
    const r = await send([contribution()], { mbh: BigInt(HEAD + 200) })
    expect(r.status).toBe(202)
    const relayId = String(r.body.relayId)
    expect(await readQuota(t.db, "global", "relay_yocto")).toBeGreaterThan(0n)
    // still able to land: stays pending
    const early = await getRelay(deps, actor.userId, relayId, "g0", { pollMs: 1, budgetMs: 5 })
    expect(early.status).toBe(202)
    // the final head passes max_block_height; the user's key nonce never moved (1_000 < delegate nonce)
    chain.head = HEAD + 500
    const g = await getRelay(deps, actor.userId, relayId, "g1", { pollMs: 1, budgetMs: 5 })
    expect(g.status).toBe(409)
    expect(g.body).toMatchObject({ ok: false, reason: "expired", detail: { cause: "lost_broadcast" } })
    const row = (await t.db.select().from(relayLog).where(eq(relayLog.id, relayId)))[0]!
    expect(row).toMatchObject({ status: "failed", reason: "expired", errorText: "lost_broadcast", httpStatus: 409 })
    expect(await readQuota(t.db, "global", "relay_yocto")).toBe(0n)
    expect(await readQuota(t.db, `user:${actor.userId}`, "relay_yocto")).toBe(0n)
    // stored: a repeat read answers the same without the chain
    expect((await getRelay(deps, actor.userId, relayId, "g2")).body).toMatchObject({ reason: "expired" })
  })

  it("lost check: the key nonce moved past the delegate (ran elsewhere) → stays pending, not failed", async () => {
    sub.script = () => "pending"
    const r = await send([contribution()], { nonce: 1_500n })
    const relayId = String(r.body.relayId)
    chain.head = HEAD + 500
    chain.accounts.get(USER)!.keys.get(key.getPublicKey().toString())!.nonce = 1_500n
    const g = await getRelay(deps, actor.userId, relayId, "g", { pollMs: 1, budgetMs: 5 })
    expect(g.status).toBe(202)
    expect((await t.db.select().from(relayLog).where(eq(relayLog.id, relayId)))[0]!.status).toBe("pending")
  })

  it("cron reconcileStaleRelays: lost relay rows → failed, landed ones classified, stale server rows → failed", async () => {
    const { reconcileStaleRelays } = await import("./reconcile")
    sub.script = () => "pending"
    const lost = String((await send([contribution()])).body.relayId)
    const landed = String((await send([contribution()])).body.relayId)
    const landedRow = (await t.db.select().from(relayLog).where(eq(relayLog.id, landed)))[0]!
    chain.txs.set(landedRow.outerTxHash!, contributedOk()({ signerId: RELAYER, receiverId: USER, actions: [] }, { pool: "", holder: "" }, 0) as never)
    await t.db.insert(relayLog).values({ id: "rl_srv", requestId: "x", op: "sync", idempotencyKey: "sync:x", senderId: RELAYER, receiverId: HUB, status: "signed", outerTxHash: "LOSTSERVER" })
    await t.db.execute(sql`UPDATE relay_log SET created_at = now() - interval '1 hour'`)
    chain.head = HEAD + 500
    const out = await reconcileStaleRelays(deps, { requestId: "cron" })
    expect(out).toMatchObject({ checked: 3, lost: 1, completed: 1, serverFailed: 1 })
    const rows = Object.fromEntries((await t.db.select().from(relayLog)).map((x) => [x.id, x]))
    expect(rows[lost]).toMatchObject({ status: "failed", reason: "expired" })
    expect(rows[landed]).toMatchObject({ status: "executed", outcome: "success" })
    expect(rows["rl_srv"]).toMatchObject({ status: "failed", errorText: "lost_broadcast" })
    // a second run is a no-op (A-17: cron twice = no double effects)
    expect(await reconcileStaleRelays(deps)).toMatchObject({ checked: 0 })
  })

  it("X-06: a contribution's after() pushes 'money arrived' to the other members (not the contributor)", async () => {
    const { pushSubscription } = await import("@/db/schema")
    const SAM = "sam.users.potapp.testnet"
    chain.view(HUB, "get_members", () => [{ account_id: USER, status: "active" }, { account_id: SAM, status: "active" }])
    const { user: sam } = await insertUser(t.db, { account: SAM })
    const p256dh = "B" + "A".repeat(86)
    for (const [u, e] of [[actor.userId, "me"], [sam.id, "sam"]] as const)
      await t.db.insert(pushSubscription).values({ userId: u, endpoint: `https://fcm.googleapis.com/${e}`, p256dh, auth: "A".repeat(22) })
    const pushed: { endpoint: string; json: string }[] = []
    deps.push = { send: async (target, json) => (pushed.push({ endpoint: target.endpoint, json }), { status: 201 }) }
    const r = await send([contribution()], { intent: "add_money" })
    expect(r.status).toBe(200)
    expect(pushed).toHaveLength(0) // nothing inside the response
    await flush()
    expect(pushed.map((p) => p.endpoint)).toEqual(["https://fcm.googleapis.com/sam"])
    expect(JSON.parse(pushed[0]!.json).notification).toMatchObject({ title: "Maya added $150", body: "Added to Lisbon Trip." })
  })

  it("no free relayer key → 503 relayer_busy and the yocto pre-charge is given back", async () => {
    sub.script = () => new ApiError("service_unavailable", { detail: { cause: "relayer_busy" }, retryAfterMs: 2_000 })
    const r = await send([contribution()])
    expect(r.body).toMatchObject({ reason: "service_unavailable", detail: { cause: "relayer_busy" } })
    expect(await readQuota(t.db, `user:${actor.userId}`, "relay_yocto")).toBe(0n)
  })
})

describe("R11 votes (rev4 S-2, A-22) and B-05 follow-ups", () => {
  const kind = { Transfer: { token_id: USDC, receiver_id: USER, amount: "300000000", msg: null } }
  const nowNs = () => (BigInt(Date.now()) * 1_000_000n).toString()
  let proposal: Record<string, unknown>
  let subject: Record<string, unknown> | null
  let members: { account_id: string; status: string }[]

  beforeEach(() => {
    proposal = { id: 3, proposer: "hub", description: "d", kind, status: "InProgress", votes: {}, submission_time: nowNs() }
    subject = { pot: DAO, proposal_id: 3, kind: "spend", request_id: 1, member: null, rules_version: null, live: true }
    members = [{ account_id: USER, status: "active" }]
    chain.view(DAO, "get_proposal", () => proposal)
    chain.view(HUB, "get_proposal_subject", () => subject)
    chain.view(HUB, "get_members", () => members)
    deps.hub = createHubReader(chain, HUB)
    sub.script = (spec) => {
      if (methodOf(spec) === "sync") return plainOutcome("s", RELAYER, HUB, valueOf({ changed: true }), [event("pot", "proposal_synced", { pot: DAO, proposal_id: 3, subject: "spend", dao_status: "Approved", hub_status: "approved" })])
      proposal = { ...proposal, status: "Approved" }
      return relayedOutcome({
        txHash: "x",
        relayer: RELAYER,
        sender: spec.receiverId,
        inner: { executor: DAO, children: [{ executor: USDC, status: valueOf(undefined) }] },
      })
    }
  })
  const vote = (action = "VoteApprove", gas = 100) => fc("act_proposal", { id: 3, action, proposal: kind }, gas)

  it("relays a member's vote, reads the status, returns the payout and calls sync in after()", async () => {
    const r = await send([vote()], { receiver: DAO, intent: "vote" })
    expect(r.body).toMatchObject({ outcome: "success", result: { type: "vote", proposalId: 3, action: "VoteApprove", proposalStatus: "Approved", payout: "sent" } })
    await flush()
    const syncRow = (await t.db.select().from(relayLog).where(eq(relayLog.op, "sync")))[0]!
    expect(syncRow).toMatchObject({ status: "executed", outcome: "success", potId: DAO, receiverId: HUB })
    expect(sub.submitted.map((s) => methodOf(s.spec))).toEqual(["delegate", "sync"])
    const feed = await t.db.select().from(feedEvent).where(eq(feedEvent.kind, "proposal_synced"))
    expect(feed).toHaveLength(1)
  })

  it("the receipts beat a lagging view: a failed payout reports Failed even when get_proposal still says Approved (QA)", async () => {
    sub.script = (spec) => {
      if (methodOf(spec) === "sync") return plainOutcome("s", RELAYER, HUB)
      proposal = { ...proposal, status: "Approved" } // the lagging node: the DAO's callback set Failed a block later
      return relayedOutcome({
        txHash: "x",
        relayer: RELAYER,
        sender: spec.receiverId,
        inner: { executor: DAO, children: [{ executor: USDC, status: panic("The account x is not registered") }] },
      })
    }
    const r = await send([vote()], { receiver: DAO, intent: "vote" })
    expect(r.body).toMatchObject({ outcome: "success", result: { type: "vote", proposalStatus: "Failed", payout: "failed" } })
    await flush()
    expect(sub.submitted.map((s) => methodOf(s.spec))).toEqual(["delegate", "sync"])
  })

  it("a sent payout reports Approved even when the view still says InProgress (QA)", async () => {
    sub.script = (spec) => {
      if (methodOf(spec) === "sync") return plainOutcome("s", RELAYER, HUB)
      return relayedOutcome({ txHash: "x", relayer: RELAYER, sender: spec.receiverId, inner: { executor: DAO, children: [{ executor: USDC, status: valueOf(undefined) }] } })
    }
    const r = await send([vote()], { receiver: DAO, intent: "vote" })
    expect(r.body).toMatchObject({ outcome: "success", result: { type: "vote", proposalStatus: "Approved", payout: "sent" } })
  })

  it("a member-created proposal (subject null) → proposal_not_tracked, no tx", async () => {
    subject = null
    expect((await send([vote()], { receiver: DAO })).body.reason).toBe("proposal_not_tracked")
    expect(sub.submitted).toHaveLength(0)
  })

  it("a replaced close (live: false) → proposal_not_tracked", async () => {
    subject = { ...subject, live: false }
    expect((await send([vote()], { receiver: DAO })).body.reason).toBe("proposal_not_tracked")
  })

  it("a non-member → not_a_member", async () => {
    members = [{ account_id: "leo.testnet", status: "active" }]
    expect((await send([vote()], { receiver: DAO })).body.reason).toBe("not_a_member")
  })

  it("a second vote → already_voted with no tx", async () => {
    proposal = { ...proposal, votes: { [USER]: "Approve" } }
    expect((await send([vote()], { receiver: DAO })).body.reason).toBe("already_voted")
  })

  it("a decided proposal → proposal_not_open with detail.status", async () => {
    proposal = { ...proposal, status: "Approved" }
    expect((await send([vote()], { receiver: DAO })).body).toMatchObject({ reason: "proposal_not_open", detail: { status: "Approved", expired: false } })
  })

  it("a proposal kind that differs from get_proposal → args_invalid", async () => {
    proposal = { ...proposal, kind: { Transfer: { ...kind.Transfer, amount: "1" } } }
    expect((await send([vote()], { receiver: DAO })).body).toMatchObject({ reason: "args_invalid", detail: { field: "proposal" } })
  })

  it("Finalize only on Failed (or expired) proposals, ≤ 3 per proposal per UTC day", async () => {
    expect((await send([vote("Finalize")], { receiver: DAO })).body.reason).toBe("proposal_not_open")
    for (let i = 0; i < 3; i++) {
      proposal = { ...proposal, status: "Failed", votes: {} }
      expect((await send([vote("Finalize")], { receiver: DAO })).status).toBe(200)
      await flush()
    }
    proposal = { ...proposal, status: "Failed" }
    expect((await send([vote("Finalize")], { receiver: DAO })).body).toMatchObject({ reason: "quota_exceeded", detail: { family: "finalize" } })
    // Finalize is pre-charged at 0.03 NEAR (rev4)
    const rows = await t.db.select().from(relayLog).where(and(eq(relayLog.op, "relay"), eq(relayLog.status, "executed")))
    expect(rows.every((x) => x.estYocto === (306n * 10n ** 20n).toString())).toBe(true)
  })

  it("a DAO panic → inner_failed with the Sputnik code, no sync", async () => {
    sub.script = (spec) =>
      relayedOutcome({ txHash: "x", relayer: RELAYER, sender: spec.receiverId, inner: { executor: DAO, status: panic("ERR_ALREADY_VOTED") } })
    const r = await send([vote()], { receiver: DAO })
    expect(r.body).toMatchObject({ outcome: "inner_failed", errorCode: "ERR_ALREADY_VOTED" })
    await flush()
    expect(sub.submitted.map((s) => methodOf(s.spec))).toEqual(["delegate"])
  })
})

describe("request_spend two-phase response (B-09, A-05)", () => {
  const spend = () =>
    fc("request_spend", { pot: DAO, amount: "84000000", receiver_id: USER, category: "groceries", request_ref: "k3d9x1a2b4c6m7n8" }, 150)
  let requests: Record<string, unknown>[]
  let release: () => void

  beforeEach(() => {
    requests = []
    chain.view(HUB, "get_requests", () => requests)
    deps.hub = createHubReader(chain, HUB)
    let wait = new Promise<void>((r) => (release = r))
    deps.sleep = async () => {
      // the probe sees the proposal after its first poll
      requests = [{ request_id: 0, pot: DAO, requester: USER, receiver_id: USER, amount: "84000000", category: "groceries", request_ref: "k3d9x1a2b4c6m7n8", path: "instant", reason: "within_rules", status: "approving", proposal_id: 2 }]
    }
    sub.script = async (spec) => {
      if (methodOf(spec) === "sync") return plainOutcome("s", RELAYER, HUB)
      await wait
      wait = Promise.resolve()
      return relayedOutcome({
        txHash: "x",
        relayer: RELAYER,
        sender: spec.receiverId,
        inner: {
          executor: HUB,
          logs: [event("pot", "spend_requested", { pot: DAO, request_id: 0, proposal_id: 2, requester: USER, receiver_id: USER, amount: "84000000", category: "groceries", request_ref: "k3d9x1a2b4c6m7n8", path: "instant", reason: "within_rules", approvals_needed: 2 })],
          children: [{ executor: DAO, children: [{ executor: USDC, status: valueOf(undefined) }] }],
          then: {
            executor: HUB,
            status: valueOf({ request_id: 0, proposal_id: 2, path: "instant", reason: "within_rules", status: "approved", refusal: null, approvals_needed: 2 }),
            logs: [event("pot", "spend_auto_approved", { pot: DAO, request_id: 0, proposal_id: 2, requester: USER, receiver_id: USER, amount: "84000000" })],
          },
        },
      })
    }
  })

  it("answers early with final: false once the proposal exists, then stores the final body", async () => {
    const r = await send([spend()], { receiver: HUB, intent: "request_spend", requestRef: "k3d9x1a2b4c6m7n8" })
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ final: false, outcome: "success", result: { type: "spend", path: "instant", proposalId: 2, payout: "pending" } })
    const relayId = String(r.body.relayId)
    const early = await getRelay(deps, actor.userId, relayId, "g1")
    expect(early.body).toMatchObject({ final: false })
    release()
    await flush()
    const fin = await getRelay(deps, actor.userId, relayId, "g2")
    expect(fin.body).toMatchObject({ final: true, outcome: "success", result: { type: "spend", requestId: 0, path: "instant", proposalId: 2, payout: "sent", approvalsNeeded: 2 } })
    const kinds = (await t.db.select().from(feedEvent)).map((f) => f.kind).sort()
    expect(kinds).toEqual(["spend_auto_approved", "spend_requested"])
  })

  it("instant path: answers at the hub's decision (status checking, no proposal id yet) — the ≤ 4 s early answer", async () => {
    deps.sleep = async () => {
      requests = [{ request_id: 0, pot: DAO, requester: USER, receiver_id: USER, amount: "84000000", category: "groceries", request_ref: "k3d9x1a2b4c6m7n8", path: "instant", reason: "within_rules", status: "checking", proposal_id: null }]
    }
    const r = await send([spend()], { receiver: HUB, intent: "request_spend", requestRef: "k3d9x1a2b4c6m7n8" })
    expect(r.body).toMatchObject({ final: false, result: { type: "spend", requestId: 0, path: "instant", proposalId: null, payout: "pending", approvalsNeeded: 2 } })
    release()
    await flush()
    const fin = await getRelay(deps, actor.userId, String(r.body.relayId), "g")
    expect(fin.body).toMatchObject({ final: true, result: { proposalId: 2, payout: "sent" } })
  })

  it("vote path: a request still checking is not an early answer (the requester's vote needs the proposal id)", async () => {
    let polls = 0
    deps.sleep = async () => {
      polls++
      requests = [{ request_id: 0, pot: DAO, requester: USER, receiver_id: USER, amount: "300000000", category: "other", request_ref: "k3d9x1a2b4c6m7n8", path: "vote", reason: "over_instant_cap", status: "checking", proposal_id: null }]
      await new Promise((res) => setTimeout(res, 1))
    }
    sub.script = async (spec) => {
      if (methodOf(spec) === "sync") return plainOutcome("s", RELAYER, HUB)
      // the probe sees the undecided vote-path record several times before the outcome lands
      while (polls < 3) await new Promise((res) => setTimeout(res, 2))
      return relayedOutcome({
        txHash: "x",
        relayer: RELAYER,
        sender: spec.receiverId,
        inner: { executor: HUB, then: { executor: HUB, status: valueOf({ request_id: 0, proposal_id: 4, path: "vote", reason: "over_instant_cap", status: "pending", refusal: null, approvals_needed: 2 }) } },
      })
    }
    const r = await send([fc("request_spend", { pot: DAO, amount: "300000000", receiver_id: USER, category: "other", request_ref: "k3d9x1a2b4c6m7n8" }, 150)], { receiver: HUB })
    expect(r.body).toMatchObject({ final: true, result: { type: "spend", path: "vote", proposalId: 4 } })
  })

  it("a refusal at the pre-check is one final response (REFUSED_*)", async () => {
    deps.sleep = async () => new Promise((r) => setTimeout(r, 5))
    sub.script = (spec) =>
      relayedOutcome({
        txHash: "x",
        relayer: RELAYER,
        sender: spec.receiverId,
        inner: { executor: HUB, then: { executor: HUB, status: valueOf({ request_id: 0, proposal_id: null, path: "instant", reason: "within_rules", status: "refused", refusal: "insufficient_balance", approvals_needed: 2 }) } },
      })
    const r = await send([spend()], { receiver: HUB })
    expect(r.body).toMatchObject({ final: true, outcome: "inner_failed", errorCode: "REFUSED_INSUFFICIENT_BALANCE" })
  })

  it("a failed instant payout → payout failed and sync in after()", async () => {
    deps.sleep = async () => new Promise((r) => setTimeout(r, 5))
    sub.script = (spec) => {
      if (methodOf(spec) === "sync") return plainOutcome("s", RELAYER, HUB)
      return relayedOutcome({
        txHash: "x",
        relayer: RELAYER,
        sender: spec.receiverId,
        inner: {
          executor: HUB,
          children: [{ executor: DAO, children: [{ executor: USDC, status: panic("The account x is not registered") }] }],
          then: { executor: HUB, status: valueOf({ request_id: 0, proposal_id: 2, path: "instant", reason: "within_rules", status: "approved", refusal: null, approvals_needed: 2 }) },
        },
      })
    }
    const r = await send([spend()], { receiver: HUB })
    expect(r.body).toMatchObject({ final: true, outcome: "success", result: { payout: "failed" } })
    await flush()
    expect(sub.submitted.map((s) => methodOf(s.spec))).toEqual(["delegate", "sync"])
    const syncRow = (await t.db.select().from(relayLog).where(eq(relayLog.op, "sync")))[0]!
    expect(syncRow.idempotencyKey).toMatch(new RegExp(`^sync:${DAO.replaceAll(".", "\\.")}:2:`))
  })
})

describe("create_pot (R2) side effects", () => {
  it("writes the pot cache, invite_meta and the feed from trusted events only", async () => {
    chain.view(HUB, "get_pot", () => null)
    deps.hub = createHubReader(chain, HUB)
    const NEW = `new-pot.${HUB}`
    sub.script = (spec) =>
      relayedOutcome({
        txHash: "x",
        relayer: RELAYER,
        sender: spec.receiverId,
        inner: {
          executor: HUB,
          then: {
            executor: HUB,
            logs: [
              event("pot", "pot_created", { pot: NEW, slug: "new-pot", name: "New Pot", emoji: null, preset: "trip", creator: USER, rules: {}, float: "1" }),
              event("pot", "invite_added", { pot: NEW, invite_pk: "ed25519:abc", by: USER, expires_at_ms: 1, max_uses: 10 }),
            ],
            // a spoofed event from another executor is ignored
            children: [{ executor: "evil.testnet", logs: [event("pot", "pot_closed", { pot: NEW })] }],
            status: valueOf({ ok: true, pot: NEW, slug: "new-pot", float: "1", usdc_registered: true }),
          },
        },
      })
    const r = await send([fc("create_pot", { slug: "new-pot", name: "New Pot", preset: "trip" }, 300)], { receiver: HUB })
    expect(r.body).toMatchObject({ outcome: "success", result: { type: "create_pot", potId: NEW, slug: "new-pot" } })
    const p = (await t.db.select().from(pot).where(eq(pot.daoId, NEW)))[0]!
    expect(p).toMatchObject({ name: "New Pot", status: "open", creatorAccount: USER })
    const n = await t.db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM invite_meta`)
    expect(n.rows[0]!.n).toBe(1)
    expect((await t.db.select().from(feedEvent)).map((f) => f.kind).sort()).toEqual(["invite_added", "pot_created"])
  })
})

describe("B-05 follow-ups and rev4 M-5", () => {
  it("after a contribution, retries approved payouts that failed (relay_log op retry_payout), ≤ 3/proposal/day", async () => {
    chain.view(HUB, "get_pot", () => ({ ...(potViewFor()), unpaid_approved: 1, request_count: 2 }))
    chain.view(HUB, "get_requests", () => [
      { request_id: 0, requester: USER, status: "approved", proposal_id: 1 },
      { request_id: 1, requester: USER, status: "payout_failed", proposal_id: 2 },
    ])
    deps.hub = createHubReader(chain, HUB)
    const base = sub.script
    sub.script = (spec, o, n) => (methodOf(spec) === "retry_payout" ? plainOutcome("r", RELAYER, HUB) : base(spec, o, n))
    expect((await send([contribution()])).status).toBe(200)
    await flush()
    const rows = await t.db.select().from(relayLog).where(eq(relayLog.op, "retry_payout"))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ potId: DAO, status: "executed" })
    expect(await readQuota(t.db, `proposal:${DAO}:2`, "finalize")).toBe(1n)
  })

  // the Finalize re-runs the payout as a detached promise; the token's ft_transfer from the DAO fails again
  const retryFailedAgain = (sender: string) =>
    relayedOutcome({
      txHash: "r",
      relayer: RELAYER,
      sender,
      inner: {
        executor: HUB,
        children: [{ executor: DAO, children: [{ executor: USDC, status: panic("Smart contract panicked: The account u-x is not registered") }] }],
        then: { executor: HUB, status: valueOf({ proposal_id: 2, retried: true, dao_status: "Approved", hub_status: "approved" }) },
      },
    })

  it("a server retry_payout whose payout fails again → sync (B-05 / contracts D7)", async () => {
    chain.view(HUB, "get_pot", () => ({ ...potViewFor(), unpaid_approved: 1, request_count: 2 }))
    chain.view(HUB, "get_requests", () => [{ request_id: 1, requester: USER, status: "payout_failed", proposal_id: 2 }])
    deps.hub = createHubReader(chain, HUB)
    const base = sub.script
    sub.script = (spec, o, n) =>
      methodOf(spec) === "retry_payout" ? retryFailedAgain(HUB) : methodOf(spec) === "sync" ? plainOutcome("s", RELAYER, HUB) : base(spec, o, n)
    expect((await send([contribution()])).status).toBe(200)
    await flush()
    expect(sub.submitted.map((s) => methodOf(s.spec))).toEqual(["delegate", "retry_payout", "sync"])
    const retry = (await t.db.select().from(relayLog).where(eq(relayLog.op, "retry_payout")))[0]!
    const sync = (await t.db.select().from(relayLog).where(eq(relayLog.op, "sync")))[0]!
    expect(retry).toMatchObject({ status: "failed", outcome: "inner_failed" })
    expect(sync).toMatchObject({ status: "executed", potId: DAO, requestId: retry.id })
    expect(sync.idempotencyKey).toBe(`sync:${DAO}:2:${retry.id}`)
  })

  it("a server retry_payout that pays → no sync", async () => {
    chain.view(HUB, "get_pot", () => ({ ...potViewFor(), unpaid_approved: 1, request_count: 2 }))
    chain.view(HUB, "get_requests", () => [{ request_id: 1, requester: USER, status: "payout_failed", proposal_id: 2 }])
    deps.hub = createHubReader(chain, HUB)
    const base = sub.script
    const paid = relayedOutcome({ txHash: "r", relayer: RELAYER, sender: HUB, inner: { executor: HUB, children: [{ executor: DAO, children: [{ executor: USDC }] }] } })
    sub.script = (spec, o, n) => (methodOf(spec) === "retry_payout" ? paid : base(spec, o, n))
    await send([contribution()])
    await flush()
    expect(sub.submitted.map((s) => methodOf(s.spec))).toEqual(["delegate", "retry_payout"])
  })

  it("a relayed retry_payout (R9) whose payout fails again → inner_failed, then sync in after()", async () => {
    chain.view(DAO, "get_last_proposal_id", () => 3)
    deps.hub = createHubReader(chain, HUB)
    sub.script = (spec) => (methodOf(spec) === "sync" ? plainOutcome("s", RELAYER, HUB) : retryFailedAgain(spec.receiverId))
    const r = await send([fc("retry_payout", { pot: DAO, proposal_id: 2 }, 100)], { receiver: HUB, intent: "retry_payout" })
    expect(r.body).toMatchObject({ outcome: "inner_failed", errorCode: "RECEIVER_NOT_REGISTERED" })
    await flush()
    expect(sub.submitted.map((s) => methodOf(s.spec))).toEqual(["delegate", "sync"])
    const sync = (await t.db.select().from(relayLog).where(eq(relayLog.op, "sync")))[0]!
    expect(sync.idempotencyKey).toBe(`sync:${DAO}:2:${r.body.relayId}`)
  })

  it("registers unregistered payees before a close approval is relayed", async () => {
    const payout = (who: string) => ({ method_name: "ft_transfer", args: Buffer.from(JSON.stringify({ receiver_id: who, amount: "22000000", memo: "pot refund" })).toString("base64"), deposit: "1", gas: "5000000000000" })
    const kind = { FunctionCall: { receiver_id: USDC, actions: [payout(USER), payout("sam.users.potapp.testnet")] } }
    chain.view(DAO, "get_proposal", () => ({ id: 7, kind, status: "InProgress", votes: {}, submission_time: (BigInt(Date.now()) * 1_000_000n).toString() }))
    chain.view(HUB, "get_proposal_subject", () => ({ pot: DAO, proposal_id: 7, kind: "close", live: true }))
    chain.view(HUB, "get_members", () => [{ account_id: USER, status: "active" }])
    chain.view(USDC, "storage_balance_of", (a) => (a.account_id === USER ? { total: "1", available: "0" } : null))
    deps.hub = createHubReader(chain, HUB)
    sub.script = (spec) =>
      methodOf(spec) === "storage_deposit" || methodOf(spec) === "sync"
        ? plainOutcome("s", RELAYER, spec.receiverId)
        : relayedOutcome({ txHash: "x", relayer: RELAYER, sender: spec.receiverId, inner: { executor: DAO } })
    const r = await send([fc("act_proposal", { id: 7, action: "VoteApprove", proposal: kind }, 300)], { receiver: DAO })
    expect(r.status).toBe(200)
    const order = sub.submitted.map((s) => `${methodOf(s.spec)}:${s.spec.receiverId}`)
    expect(order[0]).toBe(`storage_deposit:${USDC}`)
    expect(order[1]).toBe(`delegate:${USER}`)
    const reg = (await t.db.select().from(relayLog).where(eq(relayLog.op, "storage_deposit")))[0]!
    expect(reg.idempotencyKey).toBe("register:sam.users.potapp.testnet")
  })
})

function potViewFor() {
  return { pot: DAO, slug: "lisbon-trip", name: "Lisbon Trip", preset: "trip", status: "open", member_count: 3, approvals_needed: 2, proposal_period_ms: 604_800_000, creator: "maya.users.potapp.testnet" }
}
