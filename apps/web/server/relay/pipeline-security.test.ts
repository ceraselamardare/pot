// Security audit 2026-11-04 fixes in the relay pipeline, end to end against pot_test with real signed delegates:
// APP-1 (per-IP quotas, the new-account tier, the sponsor balance guard), APP-2 (lazy registration after create/join and
// before a spend to oneself), HUB-5 (close payees from their own budget, registered at propose time too) and APP-9 (one
// in-flight delegate per nonce).
import { vi } from "vitest"
vi.mock("server-only", () => ({}))
import { and, eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { readQuota } from "@/db/quota"
import { alertState, appUser, relayLog } from "@/db/schema"
import { createTestDb, type TestDb } from "@/db/testing"
import { resetBalanceCacheForTests } from "../chain/balance"
import { createHubReader } from "../chain/hub"
import type { RpcClient } from "../chain/rpc"
import type { Config } from "../config"
import { ApiError } from "../http/errors"
import { resetOpsCacheForTests } from "../ops/balances"
import { DAO, fc, HUB, newKey, signDelegate, USDC } from "../testing/delegates"
import { RELAYER, NEAR, insertUser, seedChain, testConfig } from "../testing/env"
import { event, FakeChain, FakeSubmitter, methodOf, plainOutcome, relayedOutcome, valueOf, type Script } from "../testing/fakeChain"
import { relay, type Actor, type RelayDeps } from "./pipeline"
import { sha256Hex } from "../util/crypto"

let t: TestDb
let cfg: Config
let chain: FakeChain
let sub: FakeSubmitter
let deferred: (() => Promise<void>)[]
let deps: RelayDeps
let rpcHook: (() => Promise<void>) | null

const USER = "u-maya0001.users.potapp.testnet"
const SAM = "sam.users.potapp.testnet"
const key = newKey()
let actor: Actor
let reqN = 0
let registered: Set<string>

const flush = async () => {
  while (deferred.length) await deferred.shift()!()
}

beforeAll(async () => {
  t = await createTestDb("relay_sec")
})
afterAll(async () => {
  await t.close()
})

const contribution = (amount = "150000000") =>
  fc("ft_transfer_call", { receiver_id: HUB, amount, msg: JSON.stringify({ pot: DAO }) }, 100, 1n)

const contributedOk =
  (amount = "150000000"): Script =>
  (spec) =>
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

/** storage_deposit registers its account; the delegate's own outcome comes from `inner`. */
const scripted =
  (inner: Script): Script =>
  (spec, opts, n) => {
    if (methodOf(spec) === "storage_deposit") {
      registered.add(argsOf(spec).account_id)
      return plainOutcome("r", RELAYER, spec.receiverId)
    }
    if (methodOf(spec) === "sync") return plainOutcome("s", RELAYER, spec.receiverId)
    return inner(spec, opts, n)
  }

function argsOf(spec: Parameters<Script>[0]): { account_id: string } {
  const a = spec.actions[0] as unknown as { functionCall?: { args: Uint8Array } }
  return JSON.parse(Buffer.from(a.functionCall!.args).toString("utf8"))
}

async function send(
  actions: ReturnType<typeof fc>[],
  over: { receiver?: string; nonce?: bigint; mbh?: bigint; intent?: string; requestRef?: string; who?: Actor; ipHash?: string } = {},
) {
  const { b64 } = await signDelegate({
    key,
    sender: USER,
    receiver: over.receiver ?? USDC,
    actions,
    nonce: over.nonce ?? 1_001n + BigInt(reqN),
    maxBlockHeight: over.mbh ?? BigInt(chain.head + 200),
  })
  const idem = `s${(reqN++).toString().padStart(15, "0")}`
  try {
    return await relay(deps, over.who ?? actor, {
      requestId: `req_${reqN}`,
      signedDelegate: b64,
      idempotencyKey: idem,
      intent: over.intent,
      requestRef: over.requestRef,
      bodyHash: sha256Hex(`${idem}|${b64}`),
      ...(over.ipHash ? { ipHash: over.ipHash } : {}),
    })
  } catch (e) {
    if (e instanceof ApiError) return { status: e.status, body: { ok: false, reason: e.reason, detail: e.detail } }
    throw e
  }
}

beforeEach(async () => {
  await t.truncate()
  for (const k of Object.keys(process.env)) if (k.startsWith("QUOTA_")) delete process.env[k]
  cfg = testConfig({ RELAYER_FLOOR_NEAR: "1", RELAYER_CRITICAL_NEAR: "2", RELAYER_WARN_NEAR: "5" })
  resetBalanceCacheForTests()
  resetOpsCacheForTests()
  chain = seedChain(new FakeChain())
  chain.account(USER, { keys: { [key.getPublicKey().toString()]: 1_000n } })
  registered = new Set([USER])
  chain.view(USDC, "storage_balance_of", (a) => (registered.has(String(a.account_id)) ? { total: "1", available: "0" } : null))
  sub = new FakeSubmitter(scripted(contributedOk()))
  deferred = []
  rpcHook = null
  // the relayer's balance read (step 11) is the moment between the chain checks and the insert: tests hook it
  const rpc: RpcClient = {
    urls: chain.urls,
    call: async (method, params) => {
      const p = params as { request_type?: string; account_id?: string }
      if (rpcHook && p?.request_type === "view_account" && p.account_id === RELAYER) {
        const h = rpcHook
        rpcHook = null
        await h()
      }
      return chain.call(method, params)
    },
  }
  deps = {
    db: t.db,
    rpc,
    hub: createHubReader(chain, HUB),
    submitter: sub,
    cfg,
    defer: (fn) => deferred.push(fn),
    sleep: () => new Promise((r) => setTimeout(r, 1)),
  }
  const { user } = await insertUser(t.db, { account: USER, key, kind: "near-auth" })
  // established (first seen two days ago) unless a test says otherwise
  actor = {
    userId: user.id,
    accountId: USER,
    kind: "near-auth",
    device: { publicKey: key.getPublicKey().toString(), status: "active" },
    createdAt: new Date(Date.now() - 2 * 86_400_000),
  }
})

describe("APP-1: per-IP quotas", () => {
  it("caps relays per hashed IP per day; another IP is unaffected", async () => {
    process.env.QUOTA_IP_RELAYS = "2"
    expect((await send([contribution()], { ipHash: "ipA" })).status).toBe(200)
    expect((await send([contribution()], { ipHash: "ipA" })).status).toBe(200)
    expect((await send([contribution()], { ipHash: "ipA" })).body).toMatchObject({ reason: "quota_exceeded", detail: { family: "relays" } })
    expect((await send([contribution()], { ipHash: "ipB" })).status).toBe(200)
  })

  it("caps Pot creation and relayer NEAR per IP", async () => {
    process.env.QUOTA_IP_RELAY_YOCTO = (12n * 10n ** 20n).toString() // one contribution's estimate (0.0012 NEAR)
    expect((await send([contribution()], { ipHash: "ipC" })).status).toBe(200)
    expect((await send([contribution()], { ipHash: "ipC" })).body).toMatchObject({ reason: "quota_exceeded", detail: { family: "budget" } })
    expect(await readQuota(t.db, "ip:ipC", "relay_yocto")).toBe(12n * 10n ** 20n)
  })
})

describe("APP-1: brand-new accounts", () => {
  it("first seen < 24 h: a daily relay total and a share of the global budgets; established accounts are not counted", async () => {
    process.env.QUOTA_NEW_USER_RELAYS = "1"
    const fresh: Actor = { ...actor, createdAt: new Date() }
    expect((await send([contribution()], { who: fresh })).status).toBe(200)
    expect((await send([contribution()], { who: fresh })).body).toMatchObject({ reason: "quota_exceeded", detail: { family: "budget" } })
    expect(await readQuota(t.db, "global", "new_relay_yocto")).toBe(12n * 10n ** 20n)
    // the same person a day later is established
    expect((await send([contribution()])).status).toBe(200)
    expect(await readQuota(t.db, "global", "new_relay_yocto")).toBe(12n * 10n ** 20n)
  })

  it("the new accounts' global share is a global cap (503), so a sybil wave leaves the rest for everyone else", async () => {
    process.env.QUOTA_GLOBAL_NEW_RELAY_YOCTO = "1"
    const fresh: Actor = { ...actor, createdAt: new Date() }
    expect((await send([contribution()], { who: fresh })).body).toMatchObject({
      reason: "service_unavailable",
      detail: { cause: "global_cap" },
    })
    expect((await send([contribution()])).status).toBe(200)
  })
})

describe("APP-1: the sponsor balance guard", () => {
  it("refuses a relay that would take the relayer below its floor (503 sponsor_low) and alerts", async () => {
    chain.accounts.get(RELAYER)!.amount = NEAR + 5n * 10n ** 20n // floor + 0.0005 NEAR < floor + this delegate's 0.0012
    expect((await send([contribution()])).body).toMatchObject({ reason: "service_unavailable", detail: { cause: "sponsor_low" } })
    await flush()
    expect((await t.db.select().from(alertState)).map((a) => a.key)).toContain("sponsor_refused:relayer")
  })

  it("refuses hub-sponsored actions once the hub can't pay them above its floor; plain contributions still go", async () => {
    chain.accounts.get(HUB)!.amount = NEAR + 10n ** 21n // floor (1) + 0.001 NEAR < a spend's 0.011
    const spend = fc(
      "request_spend",
      { pot: DAO, amount: "84000000", receiver_id: USER, category: "groceries", request_ref: "k3d9x1a2b4c6m7n8" },
      150,
    )
    expect((await send([spend], { receiver: HUB, intent: "request_spend" })).body).toMatchObject({
      reason: "service_unavailable",
      detail: { cause: "sponsor_low", account: "hub" },
    })
    expect((await send([contribution()])).status).toBe(200)
    await flush()
    expect((await t.db.select().from(alertState)).map((a) => a.key)).toContain("sponsor_refused:hub")
  })
})

describe("APP-2: lazy registration", () => {
  const joinOk: Script = (spec) =>
    relayedOutcome({
      txHash: "j",
      relayer: RELAYER,
      sender: spec.receiverId,
      inner: { executor: HUB, status: valueOf({ ok: true, status: "active" }) },
    })
  const join = () =>
    fc("join", { pot: DAO, invite_pk: newKey().getPublicKey().toString(), signature: Buffer.alloc(64, 1).toString("base64") }, 150)

  it("joining a Pot registers the joiner after the response (charged to the IP), once", async () => {
    registered.delete(USER)
    await t.db.update(appUser).set({ usdcRegistered: false })
    sub.script = scripted(joinOk)
    const r = await send([join()], { receiver: HUB, intent: "join", ipHash: "ipJ" })
    expect(r.status).toBe(200)
    expect(sub.submitted.map((s) => methodOf(s.spec))).toEqual(["delegate"])
    await flush()
    expect(sub.submitted.map((s) => methodOf(s.spec))).toEqual(["delegate", "storage_deposit"])
    expect(await readQuota(t.db, "ip:ipJ", "registrations")).toBe(1n)
    expect(await readQuota(t.db, "global", "registrations")).toBe(1n)
  })

  it("a spend to oneself by an unregistered account registers it BEFORE the request is relayed", async () => {
    registered.delete(USER)
    await t.db.update(appUser).set({ usdcRegistered: false })
    sub.script = scripted((spec) =>
      relayedOutcome({
        txHash: "q",
        relayer: RELAYER,
        sender: spec.receiverId,
        inner: { executor: HUB, status: valueOf({ status: "approved", request_id: 0, path: "instant" }) },
      }),
    )
    const spend = fc(
      "request_spend",
      { pot: DAO, amount: "84000000", receiver_id: USER, category: "groceries", request_ref: "k3d9x1a2b4c6m7n8" },
      150,
    )
    await send([spend], { receiver: HUB, intent: "request_spend", who: { ...actor, usdcRegistered: false } })
    expect(sub.submitted.map((s) => methodOf(s.spec)).slice(0, 2)).toEqual(["storage_deposit", "delegate"])
  })
})

describe("HUB-5: close payees", () => {
  const payout = (who: string) => ({
    method_name: "ft_transfer",
    args: Buffer.from(JSON.stringify({ receiver_id: who, amount: "22000000", memo: "pot refund" })).toString("base64"),
    deposit: "1",
    gas: "5000000000000",
  })
  const kind = { FunctionCall: { receiver_id: USDC, actions: [payout(USER), payout(SAM)] } }
  const closeVote = () => fc("act_proposal", { id: 7, action: "VoteApprove", proposal: kind }, 300)
  const voteOk: Script = (spec) => relayedOutcome({ txHash: "v", relayer: RELAYER, sender: spec.receiverId, inner: { executor: DAO } })

  beforeEach(() => {
    chain.view(DAO, "get_proposal", () => ({
      id: 7,
      kind,
      status: "InProgress",
      votes: {},
      submission_time: (BigInt(Date.now()) * 1_000_000n).toString(),
    }))
    chain.view(HUB, "get_proposal_subject", () => ({ pot: DAO, proposal_id: 7, kind: "close", live: true }))
    chain.view(HUB, "get_members", () => [{ account_id: USER, status: "active" }])
    sub.script = scripted(voteOk)
  })

  it("registers an unregistered payee from the CLOSE budget, even when sign-ups used up the general one", async () => {
    process.env.QUOTA_GLOBAL_REGISTRATIONS = "0"
    const r = await send([closeVote()], { receiver: DAO, intent: "vote" })
    expect(r.status).toBe(200)
    expect(sub.submitted.map((s) => `${methodOf(s.spec)}`).slice(0, 2)).toEqual(["storage_deposit", "delegate"])
    expect(await readQuota(t.db, "global", "close_registrations")).toBe(1n)
    expect(await readQuota(t.db, `pot:${DAO}`, "close_registrations")).toBe(1n)
  })

  it("a payee who unregistered on purpose is registered again (the close would fail atomically otherwise)", async () => {
    await t.db.insert(relayLog).values({
      id: "rl_old_register",
      requestId: "r",
      op: "storage_deposit",
      idempotencyKey: `register:${SAM}`,
      receiverId: USDC,
      methods: ["storage_deposit"],
      status: "executed",
    })
    expect((await send([closeVote()], { receiver: DAO, intent: "vote" })).status).toBe(200)
    expect(sub.submitted.map((s) => methodOf(s.spec))[0]).toBe("storage_deposit")
  })

  it("no close budget left: 503 before the vote, nothing relayed, the request's quota pre-charges given back", async () => {
    process.env.QUOTA_GLOBAL_CLOSE_REGISTRATIONS = "0"
    const r = await send([closeVote()], { receiver: DAO, intent: "vote", ipHash: "ipV" })
    expect(r.body).toMatchObject({ reason: "service_unavailable", detail: { cause: "sponsor_low", why: "payee_registration" } })
    expect(sub.submitted).toHaveLength(0)
    expect(await readQuota(t.db, `user:${actor.userId}`, "vote")).toBe(0n)
    expect(await readQuota(t.db, "global", "relay_yocto")).toBe(0n)
    expect(await readQuota(t.db, "ip:ipV", "relays")).toBe(0n)
  })

  it("propose_close registers the payees named in the hub's close_proposed event right after the response", async () => {
    sub.script = scripted((spec) =>
      relayedOutcome({
        txHash: "c",
        relayer: RELAYER,
        sender: spec.receiverId,
        inner: {
          executor: HUB,
          logs: [
            event("pot", "close_proposed", {
              pot: DAO,
              proposal_id: 7,
              by: USER,
              balance: "44000000",
              payouts: [
                { account_id: USER, amount: "22000000" },
                { account_id: SAM, amount: "22000000" },
              ],
              dust: "0",
              dust_to: USER,
            }),
          ],
          status: valueOf({ ok: true, proposal_id: 7 }),
        },
      }),
    )
    const r = await send([fc("propose_close", { pot: DAO }, 150)], { receiver: HUB, intent: "propose_close" })
    expect(r.status).toBe(200)
    await flush()
    const regs = await t.db.select().from(relayLog).where(eq(relayLog.op, "storage_deposit"))
    expect(regs.map((x) => x.idempotencyKey)).toEqual([`register:${SAM}`])
  })
})

describe("APP-9: one in-flight delegate per (sender, key, nonce)", () => {
  const inflightRow = (id: string, nonce: bigint, mbh: number) => ({
    id,
    requestId: id,
    userId: actor.userId,
    op: "relay" as const,
    senderId: USER,
    receiverId: USDC,
    methods: ["ft_transfer_call"],
    delegateHash: `h_${id}`,
    delegatePublicKey: key.getPublicKey().toString(),
    delegateNonce: nonce.toString(),
    maxBlockHeight: mbh,
    status: "pending" as const,
    estYocto: "1000",
  })

  it("the database refuses a second in-flight row for the same nonce; finished rows don't hold it", async () => {
    await t.db.insert(relayLog).values(inflightRow("rl_a", 5_000n, chain.head + 100))
    await expect(t.db.insert(relayLog).values(inflightRow("rl_b", 5_000n, chain.head + 100))).rejects.toBeTruthy()
    await t.db.update(relayLog).set({ status: "failed" }).where(eq(relayLog.id, "rl_a"))
    await t.db.insert(relayLog).values(inflightRow("rl_b", 5_000n, chain.head + 100))
  })

  it("a delegate that went in flight between our read and our insert → 409 nonce_pending, nothing sent, quotas given back", async () => {
    rpcHook = async () => {
      await t.db.insert(relayLog).values(inflightRow("rl_race", 1_500n, chain.head + 100))
    }
    const r = await send([contribution()], { nonce: 1_500n, ipHash: "ipR" })
    expect(r.body).toMatchObject({ reason: "nonce_pending" })
    expect(sub.submitted).toHaveLength(0)
    expect(await readQuota(t.db, `user:${actor.userId}`, "contribute")).toBe(0n)
    expect(await readQuota(t.db, "global", "relay_yocto")).toBe(0n)
    expect(await readQuota(t.db, "ip:ipR", "relays")).toBe(0n)
    const rejected = await t.db
      .select()
      .from(relayLog)
      .where(and(eq(relayLog.status, "rejected"), eq(relayLog.reason, "nonce_pending")))
    expect(rejected).toHaveLength(1)
  })

  it("an expired in-flight row with the same nonce (a lost broadcast) is released and the new delegate goes", async () => {
    await t.db.insert(relayLog).values(inflightRow("rl_lost", 1_600n, chain.head - 5))
    const r = await send([contribution()], { nonce: 1_600n })
    expect(r.status).toBe(200)
    const old = (await t.db.select().from(relayLog).where(eq(relayLog.id, "rl_lost")))[0]!
    expect(old).toMatchObject({ status: "failed", reason: "expired", errorText: "lost_broadcast" })
  })
})

describe("hub 1.3.0: closes settle through the hub", () => {
  const CLOSE = 9
  const payout = (who: string) => ({
    method_name: "ft_transfer",
    args: Buffer.from(JSON.stringify({ receiver_id: who, amount: "22000000" })).toString("base64"),
    deposit: "1",
    gas: "5000000000000",
  })
  const kind = { FunctionCall: { receiver_id: USDC, actions: [payout(USER), payout(SAM)] } }
  const gasOf = (x: (typeof sub.submitted)[number]) =>
    (x.spec.actions[0] as unknown as { functionCall?: { gas: bigint } }).functionCall?.gas
  let pv: Record<string, unknown>

  beforeEach(() => {
    pv = {
      pot: DAO,
      slug: "lisbon-trip",
      status: "closing",
      close_proposal_id: CLOSE,
      close_settling: false,
      policy_version: 3,
      member_count: 3,
      approvals_needed: 2,
      proposal_period_ms: 604_800_000,
      request_count: 1,
    }
    chain.view(HUB, "get_pot", () => pv)
    chain.view(DAO, "get_last_proposal_id", () => 20)
    chain.view(DAO, "get_proposal", () => ({
      id: CLOSE,
      kind,
      status: "Failed",
      votes: {},
      submission_time: (BigInt(Date.now()) * 1_000_000n).toString(),
    }))
    chain.view(HUB, "get_proposal_subject", () => ({ pot: DAO, proposal_id: CLOSE, kind: "close", live: true }))
    chain.view(HUB, "get_members", () => [{ account_id: USER, status: "active" }])
    deps.hub = createHubReader(chain, HUB)
  })

  it("a member's Finalize on a v3/v4 Pot is refused up front (409) and the hub's own retry starts instead", async () => {
    const r = await send([fc("act_proposal", { id: CLOSE, action: "Finalize", proposal: kind }, 300)], { receiver: DAO, intent: "vote" })
    expect(r.body).toMatchObject({ reason: "action_not_allowed", detail: { cause: "finalize_by_hub", retrying: true } })
    expect(r.status).toBe(409)
    expect(sub.submitted).toHaveLength(0) // nothing relayed: the DAO would refuse a member Finalize (ERR_PERMISSION_DENIED)
    await flush()
    // sam registered first (HUB-5), then retry_payout(pot, close) server-signed at 300 Tgas, then sync to confirm (HUB-4)
    expect(sub.submitted.map((x) => methodOf(x.spec))).toEqual(["storage_deposit", "retry_payout", "sync"])
    expect(gasOf(sub.submitted[1]!)).toBe(300n * 10n ** 12n)
  })

  it("a member's Finalize on a v1/v2 Pot is still relayed", async () => {
    pv = { ...pv, policy_version: 2 }
    sub.script = scripted((spec) => relayedOutcome({ txHash: "f", relayer: RELAYER, sender: spec.receiverId, inner: { executor: DAO } }))
    const r = await send([fc("act_proposal", { id: CLOSE, action: "Finalize", proposal: kind }, 300)], { receiver: DAO, intent: "vote" })
    expect(r.status).toBe(200)
    expect(sub.submitted.map((x) => methodOf(x.spec))).toContain("delegate")
  })

  it("a relayed close retry that fits the 150 Tgas cap: payees registered first, and synced after even when it paid", async () => {
    sub.script = scripted((spec) =>
      relayedOutcome({
        txHash: "r",
        relayer: RELAYER,
        sender: spec.receiverId,
        inner: { executor: HUB, status: valueOf({ retried: true }) },
      }),
    )
    const r = await send([fc("retry_payout", { pot: DAO, proposal_id: CLOSE }, 150)], { receiver: HUB, intent: "retry_payout" })
    expect(r.status).toBe(200)
    await flush()
    expect(sub.submitted.map((x) => methodOf(x.spec))).toEqual(["storage_deposit", "delegate", "sync"])
  })

  it("a close too big for the relayer's 150 Tgas (> 17 payees) is retried server-signed at 300 Tgas instead", async () => {
    pv = { ...pv, member_count: 25 } // 40 + 6·25 = 190 Tgas > 150
    const r = await send([fc("retry_payout", { pot: DAO, proposal_id: CLOSE }, 150)], { receiver: HUB, intent: "retry_payout" })
    expect(r.body).toMatchObject({ reason: "action_not_allowed", detail: { cause: "close_retry_by_server", retrying: true } })
    expect(sub.submitted).toHaveLength(0)
    await flush()
    expect(sub.submitted.map((x) => methodOf(x.spec))).toEqual(["storage_deposit", "retry_payout", "sync"])
    expect(gasOf(sub.submitted[1]!)).toBe(300n * 10n ** 12n)
  })

  it("server close retries share the ≤ 3/proposal/day finalize quota", async () => {
    for (let i = 0; i < 4; i++)
      await send([fc("act_proposal", { id: CLOSE, action: "Finalize", proposal: kind }, 300)], { receiver: DAO, intent: "vote" })
    await flush()
    expect(sub.submitted.filter((x) => methodOf(x.spec) === "retry_payout")).toHaveLength(3)
  })

  it("a relayed spend retry that paid is synced too (not only a failed one)", async () => {
    pv = { ...pv, status: "open", close_proposal_id: null }
    sub.script = scripted((spec) =>
      relayedOutcome({
        txHash: "p",
        relayer: RELAYER,
        sender: spec.receiverId,
        inner: { executor: HUB, status: valueOf({ retried: true }) },
      }),
    )
    const r = await send([fc("retry_payout", { pot: DAO, proposal_id: 4 }, 100)], { receiver: HUB, intent: "retry_payout" })
    expect(r.status).toBe(200)
    await flush()
    expect(sub.submitted.map((x) => methodOf(x.spec))).toEqual(["delegate", "sync"])
  })
})
