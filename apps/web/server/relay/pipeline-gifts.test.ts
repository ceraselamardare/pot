// hub 1.2.0 gifts through the relay pipeline (against pot_test, a fake chain and a scripted submitter):
// R16 gifts from non-members, the FLAG_GIFTS gate, the hub's get_gifts pre-flight, the web app's
// validateGiftRef hook, classification of `gift_received` (+ the received / failed hooks), the gift
// quotas (user_gift, pot_gift, ip_gift) and R17 set_gifts.
import { vi } from "vitest"
vi.mock("server-only", () => ({}))
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { readQuota } from "@/db/quota"
import { relayLog } from "@/db/schema"
import { createTestDb, type TestDb } from "@/db/testing"
import { resetBalanceCacheForTests } from "../chain/balance"
import { createHubReader } from "../chain/hub"
import type { Config } from "../config"
import { ApiError } from "../http/errors"
import { DAO, fc, HUB, newKey, signDelegate, USDC } from "../testing/delegates"
import { RELAYER, insertUser, seedChain, testConfig } from "../testing/env"
import { event, FakeChain, FakeSubmitter, HEAD, panic, relayedOutcome, valueOf, type Script } from "../testing/fakeChain"
import { relay, type Actor, type RelayDeps, type RelayGiftHooks } from "./pipeline"
import { sha256Hex } from "../util/crypto"

let t: TestDb
let cfg: Config
let chain: FakeChain
let sub: FakeSubmitter
let deferred: (() => Promise<void>)[]
let deps: RelayDeps
let gifts: { accepting: boolean; refusal: string | null } | "missing"
let received: unknown[]
let failed: string[]

// a giver who is NOT a member of the Pot (the seeded hub's get_members is never consulted for R16)
const GIVER = "u-ana00001.users.potapp.testnet"
const key = newKey()
let actor: Actor
let reqN = 0
const REF = "g0123456789abcdefghjkmnp"

const flush = async () => {
  while (deferred.length) await deferred.shift()!()
}

beforeAll(async () => {
  t = await createTestDb("relay_gifts")
})
afterAll(async () => {
  await t.close()
})

const giftCall = (amount = "10000000", ref = REF) =>
  fc("ft_transfer_call", { receiver_id: HUB, amount, msg: JSON.stringify({ pot: DAO, gift: ref }) }, 100, 1n)

const giftOk = (amount = "10000000", ref = REF): Script => (spec) =>
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
          logs: [event("pot", "gift_received", { pot: DAO, from: spec.receiverId, amount, ref, gifts_total: amount, gifts_count: 1 })],
        },
      ],
      then: { executor: USDC, status: valueOf(amount) },
    },
  })

async function send(actions: ReturnType<typeof fc>[], over: { receiver?: string; intent?: string; ipHash?: string } = {}) {
  const { b64 } = await signDelegate({
    key,
    sender: GIVER,
    receiver: over.receiver ?? USDC,
    actions,
    nonce: 1_001n + BigInt(reqN),
    maxBlockHeight: BigInt(HEAD + 200),
  })
  const idem = `k${(reqN++).toString().padStart(15, "0")}`
  const body = { signedDelegate: b64, idempotencyKey: idem, intent: over.intent }
  try {
    return await relay(deps, actor, {
      requestId: `req_${reqN}`,
      signedDelegate: b64,
      idempotencyKey: idem,
      intent: over.intent,
      bodyHash: sha256Hex(JSON.stringify(body)),
      ...(over.ipHash ? { ipHash: over.ipHash } : {}),
    })
  } catch (e) {
    if (e instanceof ApiError) return { status: e.status, body: { ok: false, reason: e.reason, detail: e.detail } as Record<string, unknown> }
    throw e
  }
}

function hooks(over: Partial<RelayGiftHooks> = {}): RelayGiftHooks {
  return {
    enabled: () => true,
    onGiftReceived: async (ev) => {
      received.push(ev)
    },
    onGiftFailed: async (ref) => {
      failed.push(ref)
    },
    ...over,
  }
}

beforeEach(async () => {
  await t.truncate()
  for (const k of Object.keys(process.env)) if (k.startsWith("QUOTA_")) delete process.env[k]
  delete process.env.FLAG_GIFTS
  cfg = testConfig({ RELAYER_FLOOR_NEAR: "1", RELAYER_CRITICAL_NEAR: "2", RELAYER_WARN_NEAR: "5" })
  resetBalanceCacheForTests()
  chain = seedChain(new FakeChain())
  chain.account(GIVER, { keys: { [key.getPublicKey().toString()]: 1_000n } })
  gifts = { accepting: true, refusal: null }
  chain.view(HUB, "get_gifts", (a) => {
    if (gifts === "missing") throw new Error("MethodNotFound")
    return a.pot === DAO ? { pot: DAO, on: gifts.refusal !== "gifts_off", total: "0", count: 0, last_gift_ms: null, in_flight: false, accepting: gifts.accepting, refusal: gifts.refusal, min_amount: "1000000" } : null
  })
  received = []
  failed = []
  sub = new FakeSubmitter(giftOk())
  deferred = []
  deps = {
    db: t.db,
    rpc: chain,
    hub: createHubReader(chain, HUB),
    submitter: sub,
    cfg,
    defer: (fn) => deferred.push(fn),
    sleep: async () => undefined,
    gifts: hooks(),
  }
  const { user } = await insertUser(t.db, { account: GIVER, key, kind: "near-auth" })
  actor = { userId: user.id, accountId: GIVER, kind: "near-auth", device: { publicKey: key.getPublicKey().toString(), status: "active" } }
})

describe("R16 gifts (hub 1.2.0)", () => {
  it("a non-member's gift: relayed, classified from gift_received, the received hook runs, quotas charged", async () => {
    const r = await send([giftCall()], { intent: "send_gift", ipHash: "iphash01" })
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({
      ok: true,
      outcome: "success",
      result: { type: "gift", recorded: true, amount: "10000000", usedAmount: "10000000", giftRef: REF, giftsTotal: "10000000" },
    })
    const [row] = await t.db.select().from(relayLog)
    expect(row).toMatchObject({ intent: "send_gift", potId: DAO, status: "executed", outcome: "success" })
    expect(await readQuota(t.db, `user:${actor.userId}`, "gift")).toBe(1n)
    expect(await readQuota(t.db, `pot:${DAO}`, "gift")).toBe(1n)
    expect(await readQuota(t.db, "ip:iphash01", "gift")).toBe(1n)
    await flush()
    expect(received).toEqual([{ pot: DAO, from: GIVER, amount: "10000000", ref: REF, txHash: expect.any(String) }])
    expect(failed).toEqual([])
  })

  it("FLAG_GIFTS off (the default) → method_not_allowed, nothing sent", async () => {
    deps.gifts = undefined
    const r = await send([giftCall()])
    expect(r.body).toMatchObject({ reason: "method_not_allowed", detail: { why: "gifts_off" } })
    expect(sub.submitted).toHaveLength(0)
    process.env.FLAG_GIFTS = "1"
    expect((await send([giftCall()])).body).toMatchObject({ outcome: "success" })
  })

  it("the hub would refuse → 409 gifts_unavailable with the hub's reason", async () => {
    for (const refusal of ["gifts_off", "goal_collecting", "paused"]) {
      gifts = { accepting: false, refusal }
      const r = await send([giftCall()])
      expect(r).toMatchObject({ status: 409, body: { reason: "gifts_unavailable", detail: { why: refusal } } })
    }
    gifts = "missing"
    expect((await send([giftCall()])).body).toMatchObject({ reason: "gifts_unavailable", detail: { why: "hub_not_ready" } })
    expect(sub.submitted).toHaveLength(0)
  })

  it("a closed Pot → pot_closed (needsOpenPot)", async () => {
    chain = seedChain(new FakeChain(), { pot: { status: "closed" } })
    chain.account(GIVER, { keys: { [key.getPublicKey().toString()]: 1_000n } })
    deps.rpc = chain
    deps.hub = createHubReader(chain, HUB)
    expect((await send([giftCall()])).body).toMatchObject({ reason: "pot_closed" })
  })

  it("validateGiftRef(pot, ref, amount, sender) gates the gift", async () => {
    const seen: unknown[] = []
    deps.gifts = hooks({
      validateGiftRef: async (pot, ref, amount, sender) => {
        seen.push([pot, ref, amount, sender])
        return ref === REF ? { ok: true } : { ok: false, why: "link_expired" }
      },
    })
    expect((await send([giftCall()])).body).toMatchObject({ outcome: "success" })
    expect(seen).toEqual([[DAO, REF, 10_000_000n, GIVER]])
    const r = await send([giftCall("10000000", "gother0000000000000000000")])
    expect(r).toMatchObject({ status: 409, body: { reason: "gifts_unavailable", detail: { why: "link_expired" } } })
  })

  it("the hub refused / the forward failed → inner_failed, refunded, the failed hook runs", async () => {
    sub.script = (spec) =>
      relayedOutcome({
        txHash: "x",
        relayer: RELAYER,
        sender: spec.receiverId,
        inner: { executor: USDC, children: [{ executor: HUB, status: panic("ERR_GIFTS_OFF") }], then: { executor: USDC, status: valueOf("0") } },
      })
    const r = await send([giftCall()])
    expect(r.body).toMatchObject({ outcome: "inner_failed", errorCode: "ERR_GIFTS_OFF", result: { type: "gift", recorded: false, usedAmount: "0", giftRef: REF } })
    // a failed forward: the hub's callback returns the amount (no panic) → GIFT_REFUNDED
    sub.script = (spec) =>
      relayedOutcome({
        txHash: "y",
        relayer: RELAYER,
        sender: spec.receiverId,
        inner: { executor: USDC, children: [{ executor: HUB, status: valueOf("10000000") }], then: { executor: USDC, status: valueOf("0") } },
      })
    expect((await send([giftCall()])).body).toMatchObject({ outcome: "inner_failed", errorCode: "GIFT_REFUNDED" })
    await flush()
    expect(failed).toEqual([REF, REF])
    expect(received).toEqual([])
  })

  it("a gift_received for another sender / ref is not trusted as this gift", async () => {
    sub.script = (spec) =>
      relayedOutcome({
        txHash: "x",
        relayer: RELAYER,
        sender: spec.receiverId,
        inner: {
          executor: USDC,
          children: [{ executor: HUB, status: valueOf("0"), logs: [event("pot", "gift_received", { pot: DAO, from: "eve.testnet", amount: "10000000", ref: REF, gifts_total: "1", gifts_count: 1 })] }],
          then: { executor: USDC, status: valueOf("10000000") },
        },
      })
    expect((await send([giftCall()])).body).toMatchObject({ outcome: "inner_failed", result: { recorded: false } })
  })

  it("quotas: user_gift, pot_gift, ip_gift", async () => {
    process.env.QUOTA_USER_GIFT = "1"
    expect((await send([giftCall()])).body).toMatchObject({ outcome: "success" })
    expect((await send([giftCall()])).body).toMatchObject({ reason: "quota_exceeded", detail: { family: "gift" } })
    delete process.env.QUOTA_USER_GIFT
    process.env.QUOTA_POT_GIFT = "1"
    expect((await send([giftCall()])).body).toMatchObject({ reason: "quota_exceeded", detail: { family: "gift" } })
    delete process.env.QUOTA_POT_GIFT
    process.env.QUOTA_IP_GIFT = "1"
    expect((await send([giftCall()], { ipHash: "iphash02" })).body).toMatchObject({ outcome: "success" })
    expect((await send([giftCall()], { ipHash: "iphash02" })).body).toMatchObject({ reason: "quota_exceeded" })
    // another IP is fine
    expect((await send([giftCall()], { ipHash: "iphash03" })).body).toMatchObject({ outcome: "success" })
  })
})

describe("R17 set_gifts (hub 1.2.0)", () => {
  const setGifts = (on: boolean) => fc("set_gifts", { pot: DAO, on }, 30)
  it("relays and classifies; behind FLAG_GIFTS", async () => {
    sub.script = (spec) =>
      relayedOutcome({
        txHash: "x",
        relayer: RELAYER,
        sender: spec.receiverId,
        inner: {
          executor: HUB,
          status: valueOf({ pot: DAO, on: false, total: "0", count: 0, last_gift_ms: null, in_flight: false, accepting: false, refusal: "gifts_off", min_amount: "1000000" }),
          logs: [event("pot", "gifts_set", { pot: DAO, on: false, by: spec.receiverId })],
        },
      })
    const r = await send([setGifts(false)], { receiver: HUB, intent: "set_gifts" })
    expect(r.body).toMatchObject({ outcome: "success", result: { type: "gifts", on: false, changed: true } })
    deps.gifts = { enabled: () => false }
    expect((await send([setGifts(true)], { receiver: HUB })).body).toMatchObject({ reason: "method_not_allowed" })
  })
})
