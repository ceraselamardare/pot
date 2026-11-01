// LIVE testnet: the relay pipeline against the deployed preview hub (notes/deploy.md), wave 2.
//   LIVE_TESTNET=1 pnpm --filter web exec vitest run server/live/hub.live.test.ts
// Skipped unless LIVE_TESTNET=1 and apps/web/.keys/preview.env + .env.local exist. Spends real testnet NEAR
// (≈ 0.2 NEAR per run: 3 dev accounts, 2 Pots, ~30 relayed txs). Covers R1-R9 + R11 end to end, the two-phase
// request_spend timing (≤ 4 s early, ≤ 10 s final), the B-05 follow-ups (receipt scan + sync, also after
// retry_payout; retry_payout after a contribution), close payee registration and the pro-rata payouts,
// and the faucet with the real token.
import { vi } from "vitest"
vi.mock("server-only", () => ({}))
import { and, eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { decodeCloseKind, newOpKey, type ActionIntent, type ProposalKind } from "@pot/sdk"
import { generateInvite, signJoin } from "@pot/sdk/sign"
import { actions } from "near-api-js"
import { appUser, feedEvent, relayLog } from "@/db/schema"
import { viewFunction } from "../chain/near"
import { createSubmitter } from "../chain/submitter"
import { claimFaucet } from "../features/faucet"
import { getRelay } from "../relay/status"
import { registerToken } from "../session/onboard"
import type { SessionCtx } from "../session/store"
import { act, devUser, eventually, liveEnabled, setupLive, sleep, type Live, type LiveUser } from "./harness"

const $ = (n: number) => BigInt(Math.round(n * 1e6))
const NEAR = 10n ** 24n
const TGAS = 10n ** 12n

describe.skipIf(!liveEnabled)("LIVE preview hub: R1-R11 through the relayer", () => {
  let L: Live
  let maya: LiveUser, sam: LiveUser, leo: LiveUser
  let pot: string
  const k = Math.random().toString(36).slice(2, 6)
  const invite = generateInvite()
  const proposal = async (id: number) => (await L.hub.getProposal(pot, id, "optimistic"))!
  const kindOf = async (id: number) => (await proposal(id)).kind as ProposalKind
  const request = (id: number) => viewFunction<{ status: string; proposal_id: number | null; path: string }>(L.rpc, L.cfg.hubId, "get_request", { pot, request_id: id })
  const bal = (a: string) => L.hub.ftBalanceOf(L.cfg.usdcId, a)
  const ok = (r: { status: number; body: Record<string, unknown> }, what: string) => {
    if (r.status !== 200 || r.body.outcome !== "success") throw new Error(`${what}: ${r.status} ${JSON.stringify(r.body).slice(0, 400)}`)
    return r.body
  }
  const syncRows = (proposalId: number) =>
    L.t.db.select().from(relayLog).where(and(eq(relayLog.op, "sync"), eq(relayLog.potId, pot))).then((rows) => rows.filter((r) => r.idempotencyKey?.startsWith(`sync:${pot}:${proposalId}:`)))

  beforeAll(async () => {
    L = await setupLive("live_hub")
  }, 60_000)
  afterAll(async () => {
    await L?.close()
    console.log("LIVE hub tx hashes:", JSON.stringify(L?.hashes, null, 2))
  })

  it("dev accounts + faucet with the real token (B-04, X-09)", { timeout: 180_000 }, async () => {
    ;[maya, sam, leo] = [await devUser(L, "Maya"), await devUser(L, "Sam"), await devUser(L, "Leo")]
    for (const u of [maya, sam, leo]) {
      expect(await L.hub.storageBalanceOf(L.cfg.usdcId, u.accountId)).not.toBeNull()
      expect((await L.rpc.call<{ amount: string }>("query", { request_type: "view_account", finality: "optimistic", account_id: u.accountId })).amount).toBe("0")
    }
    for (const [u, amount] of [[maya, "300000000"], [sam, "200000000"]] as const) {
      const user = (await L.t.db.select().from(appUser).where(eq(appUser.nearAccount, u.accountId)))[0]!
      const ctx: SessionCtx = { idHash: "live", kind: "dev", expiresAt: new Date(Date.now() + 3600_000), user, device: null, pendingDevice: false, visitorHash: null, demo: null }
      const f = await claimFaucet({ db: L.t.db, rpc: L.rpc, submitter: L.submitter, cfg: L.cfg }, ctx, { amount, idempotencyKey: `faucet${k}${u.name}`.toLowerCase().padEnd(16, "0").slice(0, 16) }, { ipHash: "live", requestId: `req_f_${u.name}` })
      L.hashes[`faucet ${u.name}`] = String(f.body.txHash)
      expect(f.status).toBe(200)
      expect(await eventually(() => bal(u.accountId), (b) => b === BigInt(amount))).toBe(BigInt(amount))
    }
  })

  it("R2 create_pot → R1 contribution → R4 join ×2 → R1 (3 members, 2 of 3)", { timeout: 240_000 }, async () => {
    const created = ok(
      await act(L, maya, { type: "create_pot", slug: `live-${k}` as never, name: "Live Trip", preset: "trip", rules: null, invitePk: invite.publicKey, emoji: "🧪" }, "create_pot"),
      "create_pot",
    )
    pot = String((created.result as { potId: string }).potId)
    expect(pot).toBe(`live-${k}.${L.cfg.hubId}`)
    const policy = await viewFunction<{ roles: { name: string }[]; proposal_bond: string }>(L.rpc, pot, "get_policy", {})
    expect(policy.roles.map((r) => r.name)).toEqual(["member", "rulebot"])
    expect(policy.proposal_bond).toBe("0")
    expect((await L.rpc.call<{ keys: unknown[] }>("query", { request_type: "view_access_key_list", finality: "optimistic", account_id: pot })).keys).toEqual([])

    const c1 = ok(await act(L, maya, { type: "add_money", pot: pot as never, amount: $(200) }, "contribution maya"), "add_money")
    expect(c1.result).toMatchObject({ type: "contribution", recorded: true, amount: "200000000" })
    for (const u of [sam, leo]) {
      const s = signJoin(invite.seed, pot, u.accountId)
      const j = ok(await act(L, u, { type: "join", pot: pot as never, invitePk: s.invitePk, signature: s.signature }, `join ${u.name}`), "join")
      expect(j.result).toMatchObject({ type: "join", member: u.accountId, status: "active" })
    }
    ok(await act(L, sam, { type: "add_money", pot: pot as never, amount: $(100) }, "contribution sam"), "add_money sam")
    const v = await eventually(() => L.hub.getPot(pot, { fresh: true }), (p) => p?.member_count === 3 && p.total_contributed === "300000000")
    expect(v).toMatchObject({ member_count: 3, approvals_needed: 2, total_contributed: "300000000", status: "open" })
    expect(await bal(pot)).toBe($(300))
    const kinds = (await L.t.db.select().from(feedEvent).where(eq(feedEvent.potId, pot))).map((f) => f.kind)
    expect(kinds).toEqual(expect.arrayContaining(["pot_created", "invite_added", "contribution", "member_joined"]))
  })

  it("R5 invites: add_invite, then rotate_invite (revoke + add in one delegate)", { timeout: 120_000 }, async () => {
    const a = generateInvite()
    const b = generateInvite()
    const added = ok(await act(L, maya, { type: "add_invite", pot: pot as never, invitePk: a.publicKey }, "add_invite"), "add_invite")
    expect(added.result).toMatchObject({ type: "invite", added: a.publicKey })
    const rot = ok(await act(L, maya, { type: "rotate_invite", pot: pot as never, oldPk: a.publicKey, newPk: b.publicKey }, "rotate_invite"), "rotate")
    expect(rot.result).toMatchObject({ type: "invite", added: b.publicKey, revoked: a.publicKey })
    const old = await viewFunction<{ revoked: boolean } | null>(L.rpc, L.cfg.hubId, "get_invite", { pot, invite_pk: a.publicKey })
    expect(old?.revoked).toBe(true)
  })

  it("R3 instant spend: early answer ≤ 4 s (final:false), final payout ≤ 10 s (two-phase, B-09)", { timeout: 120_000 }, async () => {
    const before = await bal(maya.accountId)
    const r = await act(L, maya, { type: "request_spend", pot: pot as never, amount: $(40), receiverId: maya.accountId as never, category: "groceries", requestRef: newOpKey() }, "instant spend")
    const body = ok(r, "instant spend")
    console.log(`two-phase: first answer ${r.ms} ms (final: ${body.final})`)
    expect(r.ms).toBeLessThanOrEqual(4_000)
    expect(body.result).toMatchObject({ type: "spend", path: "instant" })
    const t0 = Date.now() - r.ms
    let fin: Record<string, unknown> = body
    while (fin.final !== true && Date.now() - t0 < 15_000) {
      await sleep(250)
      fin = (await getRelay(L.deps, maya.actor.userId, String(body.relayId), "req_poll", { budgetMs: 0 })).body
    }
    const finalMs = Date.now() - t0
    console.log(`two-phase: final ${finalMs} ms, payout ${(fin.result as { payout?: string }).payout}`)
    expect(fin).toMatchObject({ final: true, outcome: "success", result: { type: "spend", path: "instant", payout: "sent" } })
    expect(finalMs).toBeLessThanOrEqual(10_000)
    expect(await eventually(() => bal(maya.accountId), (b) => b === before + $(40))).toBe(before + $(40))
  })

  it("R3 vote spend + R11 votes; a payout to an unregistered payee fails → sync (B-05); R9 retry fails → sync (D7); a contribution → auto retry_payout pays", { timeout: 360_000 }, async () => {
    // the vote path is used for amounts over the $100 instant limit; the payee (Leo) is registered now
    const ref = newOpKey()
    const req = ok(await act(L, maya, { type: "request_spend", pot: pot as never, amount: $(120), receiverId: leo.accountId as never, category: "other", requestRef: ref }, "vote spend"), "vote spend")
    const spendRes = req.result as { path: string; proposalId: number; requestId: number; approvalsNeeded: number }
    expect(spendRes).toMatchObject({ path: "vote", approvalsNeeded: 2 })
    const pid = spendRes.proposalId

    // Leo leaves the token (storage_unregister needs 1 yocto + gas: a little NEAR from the relayer pool)
    const fund = await L.submitter.submit({ signerId: L.cfg.relayerAccountId, receiverId: leo.accountId, actions: [actions.transfer(NEAR / 20n)] }, { pool: "relayer_key", holder: `fund-${k}` })
    if (fund.kind === "outcome") L.hashes["fund leo (test setup)"] = fund.txHash
    await eventually(() => L.rpc.call<{ amount: string }>("query", { request_type: "view_account", finality: "optimistic", account_id: leo.accountId }), (a) => BigInt(a.amount) > 0n)
    // test setup only: Leo signs his own tx (his device key as a one-key "pool" of our submitter, so the RPC
    // failover and 429 handling apply; FastNEAR rate-limits when Playwright shares the IP)
    const leoSub = createSubmitter({ db: L.t.db, rpc: L.rpc, pools: { leo: [{ publicKey: leo.key.getPublicKey().toString(), keyPair: leo.key }] } })
    const un = await leoSub.submit({ signerId: leo.accountId, receiverId: L.cfg.usdcId, actions: [actions.functionCall("storage_unregister", { force: false }, 30n * TGAS, 1n)] }, { pool: "leo", holder: `unreg-${k}` })
    if (un.kind !== "outcome") throw new Error("storage_unregister pending")
    L.hashes["leo storage_unregister (test setup)"] = un.txHash
    expect(await eventually(() => L.hub.storageBalanceOf(L.cfg.usdcId, leo.accountId), (s) => s === null)).toBeNull()

    // Maya's own approval (1 of 2), then Sam's deciding vote: the payout fails → Failed
    const kind = await kindOf(pid)
    const v1 = ok(await act(L, maya, { type: "vote", pot: pot as never, proposalId: pid as never, kind, action: "VoteApprove" }, "vote maya"), "vote maya")
    expect(v1.result).toMatchObject({ type: "vote", proposalStatus: "InProgress" })
    const v2 = ok(await act(L, sam, { type: "vote", pot: pot as never, proposalId: pid as never, kind, action: "VoteApprove" }, "vote sam (payout fails)"), "vote sam")
    expect(v2.result).toMatchObject({ type: "vote", proposalStatus: "Failed", payout: "failed" })
    await L.drain()
    expect((await syncRows(pid)).some((r) => r.status === "executed")).toBe(true) // sync after every relayed vote
    expect(await eventually(() => request(spendRes.requestId), (q) => q.status === "payout_failed")).toMatchObject({ status: "payout_failed" })

    // R9 retry_payout while Leo is still unregistered: the hub's `approved` is optimistic → after() syncs it back
    const syncsBefore = (await syncRows(pid)).length
    const retry = await act(L, maya, { type: "retry_payout", pot: pot as never, proposalId: pid as never }, "retry_payout (fails again)")
    expect(retry.body).toMatchObject({ outcome: "inner_failed", errorCode: "RECEIVER_NOT_REGISTERED" })
    await L.drain()
    const syncs = await syncRows(pid)
    expect(syncs.length).toBe(syncsBefore + 1)
    expect(syncs.at(-1)!.requestId).toBe(retry.body.relayId)
    L.hashes["sync after failed retry"] = String(syncs.at(-1)!.outerTxHash)
    expect(await eventually(() => request(spendRes.requestId), (q) => q.status === "payout_failed")).toMatchObject({ status: "payout_failed" })

    // Leo registers again; Sam's contribution triggers the server's retry_payout (B-05), which pays this time
    const reg = await registerToken({ db: L.t.db, rpc: L.rpc, submitter: L.submitter, cfg: L.cfg }, leo.accountId)
    L.hashes["leo re-register"] = reg.txHash
    expect(reg.ok).toBe(true)
    ok(await act(L, sam, { type: "add_money", pot: pot as never, amount: $(10) }, "contribution sam (triggers retry)"), "add_money")
    await L.drain()
    const retries = await L.t.db.select().from(relayLog).where(and(eq(relayLog.op, "retry_payout"), eq(relayLog.potId, pot)))
    expect(retries.at(-1)).toMatchObject({ status: "executed", outcome: "success" })
    L.hashes["server retry_payout (pays)"] = String(retries.at(-1)!.outerTxHash)
    expect(await eventually(() => bal(leo.accountId), (b) => b === $(120))).toBe($(120))
    expect(await eventually(() => request(spendRes.requestId), (q) => q.status === "approved")).toMatchObject({ status: "approved" })
  })

  it("R7 propose_rules (several members) + R11 votes at 300 Tgas → rules_changed", { timeout: 180_000 }, async () => {
    const rules = { instantCap: $(50), memberBudget: $(200), instantPayees: "members" as const, payeeAllowlist: [] }
    const p = ok(await act(L, maya, { type: "propose_rules", pot: pot as never, rules }, "propose_rules"), "propose_rules")
    const pid = (p.result as { proposalId: number }).proposalId
    expect(p.result).toMatchObject({ type: "rules", applied: false })
    const kind = await kindOf(pid)
    ok(await act(L, maya, { type: "vote", pot: pot as never, proposalId: pid as never, kind, action: "VoteApprove" }, "rules vote maya"), "v")
    const v = ok(await act(L, sam, { type: "vote", pot: pot as never, proposalId: pid as never, kind, action: "VoteApprove" }, "rules vote sam"), "v")
    expect(v.result).toMatchObject({ proposalStatus: "Approved" })
    await L.drain()
    const r = await eventually(() => viewFunction<{ rules: { instant_cap: string }; rules_version: number }>(L.rpc, L.cfg.hubId, "get_rules", { pot }), (x) => x?.rules.instant_cap === "50000000")
    expect(r).toMatchObject({ rules: { instant_cap: "50000000" }, rules_version: 2 })
    expect((await syncRows(pid)).length).toBeGreaterThan(0)
  })

  it("R6 set_rules by a sole member (a second Pot)", { timeout: 120_000 }, async () => {
    const c = ok(await act(L, sam, { type: "create_pot", slug: `live-${k}-solo` as never, name: "Solo", preset: "club", rules: null }, "create_pot solo"), "create")
    const solo = String((c.result as { potId: string }).potId)
    const rules = { instantCap: $(25), memberBudget: $(100), instantPayees: "members" as const, payeeAllowlist: [] }
    const s = ok(await act(L, sam, { type: "set_rules", pot: solo as never, rules }, "set_rules solo"), "set_rules")
    expect(s.result).toMatchObject({ type: "rules", applied: true })
  })

  it("R8 propose_close + R11 approvals (300 Tgas) → pro-rata payouts, DAO at 0, closed after sync", { timeout: 300_000 }, async () => {
    // contributions/instant spends make the Pot busy for 60 s (notes/sdk.md #4)
    await sleep(62_000)
    const members = await L.hub.getMembers(pot, { fresh: true })
    const balanceBefore = await bal(pot)
    const before = Object.fromEntries(await Promise.all(members.map(async (m) => [m.account_id, await bal(m.account_id)] as const)))
    const c = ok(await act(L, maya, { type: "propose_close", pot: pot as never }, "propose_close"), "propose_close")
    const pid = (c.result as { proposalId: number }).proposalId
    const kind = await kindOf(pid)
    const payouts = decodeCloseKind(kind, L.cfg.usdcId)!
    const total = payouts.reduce((s, p) => s + p.amount, 0n)
    expect(total).toBe(balanceBefore)
    ok(await act(L, maya, { type: "vote", pot: pot as never, proposalId: pid as never, kind, action: "VoteApprove" } as ActionIntent, "close vote maya"), "v")
    const v = ok(await act(L, sam, { type: "vote", pot: pot as never, proposalId: pid as never, kind, action: "VoteApprove" } as ActionIntent, "close vote sam"), "v")
    expect(v.result).toMatchObject({ proposalStatus: "Approved" })
    await L.drain()
    expect(await eventually(() => bal(pot), (b) => b === 0n)).toBe(0n)
    const contributed = Object.fromEntries(members.map((m) => [m.account_id, BigInt(m.contributed)]))
    const sum = Object.values(contributed).reduce((a, b) => a + b, 0n)
    for (const p of payouts) {
      // pro-rata: floor(balance × contributed / Σ) (+ the dust to the last contributor)
      expect(p.amount - (balanceBefore * contributed[p.account]!) / sum).toBeLessThan(10n)
      expect(await eventually(() => bal(p.account), (b) => b === before[p.account]! + p.amount)).toBe(before[p.account]! + p.amount)
    }
    console.log("close payouts:", payouts.map((p) => `${p.account.split(".")[0]} ${Number(p.amount) / 1e6}`).join(", "))
    expect(await eventually(() => L.hub.getPot(pot, { fresh: true }), (p) => p?.status === "closed")).toMatchObject({ status: "closed" })
  })
})
