// hub 1.1.0 all-or-nothing goal refunds in the reconcile cron (ops/goals.ts), against a test schema with a fake chain
// and a scripted submitter: which Pots are picked, propose → approve in one run, nothing twice, the back-off after a
// rejected refund (1, 2, 4… days), giving up after MAX_REFUND_PROPOSALS, and a 1.0.0 hub (no get_goal).
import { vi } from "vitest"
vi.mock("server-only", () => ({}))
import { eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { alertState, pot, relayLog } from "@/db/schema"
import { createTestDb, type TestDb } from "@/db/testing"
import { createHubReader } from "../chain/hub"
import { RpcError } from "../chain/rpc"
import type { RelayDeps } from "../relay/pipeline"
import { DAO, HUB, USDC } from "../testing/delegates"
import { potView, seedChain, testConfig } from "../testing/env"
import { event, FakeChain, FakeSubmitter, methodOf, plainOutcome } from "../testing/fakeChain"
import { MAX_REFUND_PROPOSALS, refundStep, refundUnfundedGoals, type GoalRow } from "./goals"
import { runReconcile } from "./reconcile"

const DAY = 86_400_000
const NOW = Date.UTC(2026, 10, 10, 4)

describe("refundStep (pure)", () => {
  const g = (o: Partial<GoalRow>): GoalRow => ({ pot: DAO, state: "refundable", refund_proposal_id: null, can_refund: true, ...o })
  it("nothing to do unless the hub says can_refund", () => {
    expect(refundStep(null, { proposals: 0, lastAt: null }, NOW)).toEqual({ action: "none" })
    expect(refundStep(g({ can_refund: false }), { proposals: 0, lastAt: null }, NOW)).toEqual({ action: "none" })
    expect(refundStep(g({ state: "collecting" }), { proposals: 0, lastAt: null }, NOW)).toEqual({ action: "none" })
  })
  it("refundable and never proposed → propose; refunding → approve (or Finalize a Failed close)", () => {
    expect(refundStep(g({}), { proposals: 0, lastAt: null }, NOW)).toEqual({ action: "propose" })
    expect(refundStep(g({ state: "refunding", refund_proposal_id: 7 }), { proposals: 1, lastAt: NOW }, NOW)).toEqual({ action: "approve" })
  })
  it("refundable again after a rejected refund → wait 1, 2, 4 days; then give up", () => {
    const rejected = g({ refund_proposal_id: 7 })
    expect(refundStep(rejected, { proposals: 1, lastAt: NOW - DAY + 1 }, NOW)).toEqual({ action: "wait", untilMs: NOW + 1 })
    expect(refundStep(rejected, { proposals: 1, lastAt: NOW - DAY }, NOW)).toEqual({ action: "propose" })
    expect(refundStep(rejected, { proposals: 2, lastAt: NOW - DAY }, NOW).action).toBe("wait")
    expect(refundStep(rejected, { proposals: 2, lastAt: NOW - 2 * DAY }, NOW).action).toBe("propose")
    expect(refundStep(rejected, { proposals: 3, lastAt: NOW - 3 * DAY }, NOW).action).toBe("wait")
    expect(refundStep(rejected, { proposals: MAX_REFUND_PROPOSALS, lastAt: NOW - 30 * DAY }, NOW)).toEqual({ action: "give_up" })
  })
})

let t: TestDb
let chain: FakeChain
let sub: FakeSubmitter
let deps: RelayDeps
/** the goal the fake hub reports, moved along by the scripted refund_unfunded calls */
let goal: GoalRow | null

beforeAll(async () => {
  t = await createTestDb("goals")
})
afterAll(async () => {
  await t.close()
})
beforeEach(async () => {
  await t.truncate()
  chain = seedChain(new FakeChain())
  chain.view(USDC, "ft_balance_of", () => "0")
  goal = { pot: DAO, state: "refundable", refund_proposal_id: null, can_refund: true, all_or_nothing: true }
  chain.view(HUB, "get_goal", (a) => (a.pot === DAO ? goal : null))
  sub = new FakeSubmitter((spec) => {
    if (methodOf(spec) !== "refund_unfunded") return plainOutcome("x", spec.signerId, spec.receiverId)
    if (goal!.state === "refundable") {
      goal = { ...goal!, state: "refunding", refund_proposal_id: 12 }
      return plainOutcome("x", spec.signerId, spec.receiverId, undefined, [event("pot", "goal_refund_proposed", { pot: DAO, proposal_id: 12, goal: { amount: "1200000000" }, total: "300000000" })])
    }
    goal = { ...goal!, state: "refunded", can_refund: false }
    return plainOutcome("x", spec.signerId, spec.receiverId, undefined, [event("pot", "goal_refunded", { pot: DAO, proposal_id: 12 })])
  })
  deps = { db: t.db, rpc: chain, hub: createHubReader(chain, HUB), submitter: sub, cfg: testConfig(), defer: () => undefined, sleep: async () => undefined }
  await t.db.insert(pot).values({ daoId: DAO, slug: "festival", hubId: HUB, name: "Festival Fund", preset: "custom", creatorAccount: "m", lastActivityAt: new Date(NOW - 40 * DAY) })
})

const refundRows = () => t.db.select().from(relayLog).where(eq(relayLog.op, "refund_unfunded"))

describe("refundUnfundedGoals (cron step)", () => {
  it("a missed all-or-nothing goal: propose, then approve in the same run (relayer-signed, 300 Tgas, 0 deposit)", async () => {
    const r = await refundUnfundedGoals(deps, "cron:test", NOW)
    expect(r).toMatchObject({ scanned: 1, refundable: 1, proposed: 1, approved: 1, failed: 0 })
    expect(sub.submitted.map((s) => [methodOf(s.spec), s.spec.receiverId, s.spec.signerId])).toEqual([
      ["refund_unfunded", HUB, deps.cfg.relayerAccountId],
      ["refund_unfunded", HUB, deps.cfg.relayerAccountId],
    ])
    const fc = (sub.submitted[0]!.spec.actions[0] as unknown as { functionCall: { gas: bigint; deposit: bigint; args: Uint8Array } }).functionCall
    expect(fc.gas).toBe(300_000_000_000_000n)
    expect(fc.deposit).toBe(0n)
    expect(JSON.parse(Buffer.from(fc.args).toString())).toEqual({ pot: DAO })
    const rows = await refundRows()
    expect(rows.map((x) => [x.intent, x.status, x.potId])).toEqual(
      expect.arrayContaining([
        ["refund_propose", "executed", DAO],
        ["refund_approve", "executed", DAO],
      ]),
    )
    // refunded: a second run does nothing
    expect(await refundUnfundedGoals(deps, "cron:test2", NOW)).toMatchObject({ refundable: 0, proposed: 0, approved: 0 })
    expect(sub.submitted).toHaveLength(2)
  })

  it("HUB-5: the refund close's payees are registered before the approval; with no close budget the approval waits", async () => {
    const payout = (who: string) => ({
      method_name: "ft_transfer",
      args: Buffer.from(JSON.stringify({ receiver_id: who, amount: "1" })).toString("base64"),
      deposit: "1",
      gas: "5000000000000",
    })
    chain.view(DAO, "get_proposal", () => ({
      id: 12,
      kind: { FunctionCall: { receiver_id: USDC, actions: [payout("sam.testnet")] } },
      status: "InProgress",
      votes: {},
      submission_time: "0",
    }))
    chain.view(USDC, "storage_balance_of", () => null)
    process.env.QUOTA_GLOBAL_CLOSE_REGISTRATIONS = "0"
    try {
      expect(await refundUnfundedGoals(deps, "cron:hub5a", NOW)).toMatchObject({ proposed: 1, approved: 0, waiting: 1 })
      expect(sub.submitted.map((x) => methodOf(x.spec))).toEqual(["refund_unfunded"])
    } finally {
      delete process.env.QUOTA_GLOBAL_CLOSE_REGISTRATIONS
    }
    expect(await refundUnfundedGoals(deps, "cron:hub5b", NOW)).toMatchObject({ approved: 1 })
    expect(sub.submitted.map((x) => methodOf(x.spec))).toEqual(["refund_unfunded", "storage_deposit", "refund_unfunded"])
  })

  it("collecting / reached / soft goals and Pots without a goal are left alone; no Pot is scanned twice a run", async () => {
    goal = { pot: DAO, state: "collecting", refund_proposal_id: null, can_refund: false }
    expect(await refundUnfundedGoals(deps, "c", NOW)).toMatchObject({ scanned: 1, refundable: 0 })
    goal = null
    expect(await refundUnfundedGoals(deps, "c", NOW)).toMatchObject({ scanned: 1, refundable: 0 })
    expect(sub.submitted).toHaveLength(0)
  })

  it("the same day twice never proposes twice (idempotency key per Pot per UTC day)", async () => {
    sub.script = (spec) => plainOutcome("x", spec.signerId, spec.receiverId) // the hub doesn't move (e.g. a lagging view)
    await refundUnfundedGoals(deps, "run1", NOW)
    await refundUnfundedGoals(deps, "run2", NOW + 60_000)
    expect(sub.submitted).toHaveLength(1)
  })

  it("back-off after a rejected refund: wait a day after the first, then propose again", async () => {
    goal = { pot: DAO, state: "refundable", refund_proposal_id: 12, can_refund: true }
    await t.db.insert(relayLog).values({ id: "r1", requestId: "c", op: "refund_unfunded", intent: "refund_propose", idempotencyKey: "k1", receiverId: HUB, potId: DAO, status: "executed", createdAt: new Date(NOW - DAY / 2) })
    expect(await refundUnfundedGoals(deps, "c", NOW)).toMatchObject({ refundable: 1, waiting: 1, proposed: 0 })
    expect(sub.submitted).toHaveLength(0)
    const later = await refundUnfundedGoals(deps, "c", NOW + DAY)
    expect(later).toMatchObject({ proposed: 1, approved: 1 })
  })

  it(`gives up after ${MAX_REFUND_PROPOSALS} rejected refunds (an alert, no more proposals)`, async () => {
    goal = { pot: DAO, state: "refundable", refund_proposal_id: 12, can_refund: true }
    for (let i = 0; i < MAX_REFUND_PROPOSALS; i++)
      await t.db.insert(relayLog).values({ id: `r${i}`, requestId: "c", op: "refund_unfunded", intent: "refund_propose", idempotencyKey: `k${i}`, receiverId: HUB, potId: DAO, status: "executed", createdAt: new Date(NOW - 40 * DAY) })
    expect(await refundUnfundedGoals(deps, "c", NOW)).toMatchObject({ gaveUp: 1, proposed: 0 })
    expect(sub.submitted).toHaveLength(0)
    expect((await t.db.select().from(alertState)).map((a) => a.key)).toContain(`goal_refund_stuck:${DAO}`)
  })

  it("a failed refund tx is counted, logged and retried on a later day", async () => {
    sub.script = () => new Error("rpc down")
    expect(await refundUnfundedGoals(deps, "c", NOW)).toMatchObject({ failed: 1, proposed: 0 })
    expect((await refundRows()).map((x) => x.status)).toEqual(["failed"])
  })

  it("a 1.0.0 hub (no get_goal) stops the step", async () => {
    chain.view(HUB, "get_goal", () => new RpcError("CONTRACT_EXECUTION_ERROR", null, "wasm execution failed with error: MethodResolveError(MethodNotFound)"))
    expect(await refundUnfundedGoals(deps, "c", NOW)).toMatchObject({ unsupported: true, refundable: 0 })
  })

  it("runs inside the reconcile cron (report.goals)", async () => {
    chain.view(HUB, "get_requests", () => [])
    const r = await runReconcile(deps, { holder: "run1", now: new Date(NOW) })
    expect(r.errors).toEqual([])
    expect(r.goals).toMatchObject({ proposed: 1, approved: 1 })
  })
})

describe("hub 1.3.0 (HUB-4): closes and refunds are confirmed once the money is out", () => {
  const argsOf = (x: (typeof sub.submitted)[number]) =>
    JSON.parse(Buffer.from((x.spec.actions[0] as unknown as { functionCall: { args: Uint8Array } }).functionCall.args).toString())
  const gasOf = (x: (typeof sub.submitted)[number]) => (x.spec.actions[0] as unknown as { functionCall: { gas: bigint } }).functionCall.gas

  it("a goal refund: propose → approve (settling) → confirm, all in one run", async () => {
    sub.script = (spec) => {
      if (methodOf(spec) !== "refund_unfunded") return plainOutcome("x", spec.signerId, spec.receiverId)
      if (goal!.state === "refundable") {
        goal = { ...goal!, state: "refunding", refund_proposal_id: 12 }
        return plainOutcome("x", spec.signerId, spec.receiverId)
      }
      // 1.3.0: the approval pays out but the goal stays `refunding` until a confirming call sees the money gone
      if (!(goal as GoalRow & { approved?: boolean }).approved) {
        goal = { ...goal!, approved: true } as GoalRow
        return plainOutcome("x", spec.signerId, spec.receiverId)
      }
      goal = { ...goal!, state: "refunded", can_refund: false }
      return plainOutcome("x", spec.signerId, spec.receiverId, undefined, [event("pot", "goal_refunded", { pot: DAO, proposal_id: 12 })])
    }
    const r = await refundUnfundedGoals(deps, "run-a", NOW)
    expect(r).toMatchObject({ proposed: 1, approved: 1, confirmed: 1, failed: 0 })
    expect(sub.submitted.map((x) => methodOf(x.spec))).toEqual(["refund_unfunded", "refund_unfunded", "refund_unfunded"])
    expect((await refundRows()).map((x) => x.intent).sort()).toEqual(["refund_approve", "refund_confirm", "refund_propose"])
    expect(goal).toMatchObject({ state: "refunded" })
  })

  it("on 1.2.0 the approval already settles the refund: no confirming call", async () => {
    expect(await refundUnfundedGoals(deps, "run-b", NOW)).toMatchObject({ approved: 1, confirmed: 0 })
    expect(sub.submitted).toHaveLength(2)
  })

  it("the cron syncs a settling close, and retries a failed close at 300 Tgas (payees registered first), then syncs it", async () => {
    goal = null
    chain.view(HUB, "get_requests", () => [])
    await t.db.update(pot).set({ lastActivityAt: new Date(), status: "closing" })
    const payout = {
      method_name: "ft_transfer",
      args: Buffer.from(JSON.stringify({ receiver_id: "sam.testnet", amount: "1" })).toString("base64"),
    }
    chain.view(DAO, "get_proposal", () => ({
      id: 9,
      kind: { FunctionCall: { receiver_id: USDC, actions: [payout] } },
      status: "Failed",
      votes: {},
      submission_time: "0",
    }))
    const registered = new Set<string>()
    chain.view(USDC, "storage_balance_of", (a) => (registered.has(String(a.account_id)) ? { total: "1", available: "0" } : null))
    sub.script = (spec) => {
      if (methodOf(spec) === "storage_deposit") registered.add("sam.testnet")
      return plainOutcome("x", spec.signerId, spec.receiverId)
    }

    // settling: approved, money not yet confirmed out → one sync of the close
    chain.view(HUB, "get_pot", () => potView({ status: "closing", close_proposal_id: 9, close_settling: true, policy_version: 3 }))
    let r = await runReconcile(deps, { holder: "c1", now: new Date(NOW) })
    expect(r.pots).toMatchObject({ closesSynced: 1, closeRetries: 0 })
    expect(sub.submitted.map((x) => [methodOf(x.spec), argsOf(x)])).toEqual([["sync", { pot: DAO, proposal_id: 9 }]])

    // failed (not settling): the hub retries it as rulebot, server-signed at 300 Tgas, after registering sam; then sync
    sub.submitted.length = 0
    chain.view(HUB, "get_pot", () => potView({ status: "closing", close_proposal_id: 9, close_settling: false, policy_version: 3 }))
    r = await runReconcile(deps, { holder: "c2", now: new Date(NOW) })
    expect(r.pots).toMatchObject({ closeRetries: 1 })
    expect(sub.submitted.map((x) => methodOf(x.spec))).toEqual(["storage_deposit", "retry_payout", "sync"])
    expect(gasOf(sub.submitted[1]!)).toBe(300_000_000_000_000n)

    // a 1.2.0 hub (no close_settling): left alone
    sub.submitted.length = 0
    chain.view(HUB, "get_pot", () => potView({ status: "closing", close_proposal_id: 9 }))
    r = await runReconcile(deps, { holder: "c3", now: new Date(NOW) })
    expect(r.pots).toMatchObject({ closesSynced: 0, closeRetries: 0 })
  })
})
