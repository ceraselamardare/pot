// LIVE testnet: demo mode against the deployed preview hub (X-08, B-08; api-spec §2.8, §5.2, §7).
//   LIVE_TESTNET=1 pnpm --filter web exec vitest run server/live/demo.live.test.ts
// Skipped unless LIVE_TESTNET=1 and the preview keys/env exist. Spends ≈ 0.15 NEAR: seeds one pool Pot
// through the relayer path (persona delegates signed with DEMO_PERSONA_KEY), leases it with a demo session,
// runs the D-61 demo script as Maya and Leo (demo intents), checks the reference-Pot refusal and
// GET /api/demo/state against the real reference Pot.
import { vi } from "vitest"
vi.mock("server-only", () => ({}))
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { newOpKey, type ProposalKind } from "@pot/sdk"
import { loadKeys } from "../chain/keys"
import { demoRelay, demoSession, type DemoIntent } from "../features/demo"
import { demoState } from "../features/demoState"
import { seedDemoPot, seedPlan } from "../features/seed"
import { ApiError } from "../http/errors"
import { loadSession, type SessionCtx } from "../session/store"
import { sha256Hex } from "../util/crypto"
import { eventually, liveEnabled, setupLive, type Live } from "./harness"

const $ = (n: number) => (n * 1e6).toFixed(0)

describe.skipIf(!liveEnabled)("LIVE preview demo: seed → lease → demo intents → state", () => {
  let L: Live
  let potId = ""
  let visitor: string | null = null
  const secret = () => process.env.APP_HMAC_SECRET!
  const cookieHeader = (cookies: string[]) => cookies.map((c) => c.split(";")[0]).join("; ")
  const session = async (persona: "maya" | "sam" | "leo"): Promise<SessionCtx> => {
    const r = await demoSession(
      { db: L.t.db, cfg: L.cfg, secret: secret(), isBot: async () => false },
      { persona, form: false, visitorCookie: visitor, ipnetHash: "live-demo", userAgent: "vitest-live" },
    )
    if (r.kind !== "json") throw new Error("expected JSON")
    const vc = r.cookies.find((c) => c.startsWith("pot_demo_visitor="))
    if (vc) visitor = vc.split(";")[0]!.slice("pot_demo_visitor=".length)
    const s = await loadSession(L.t.db, new Request("https://pot.test", { headers: { cookie: cookieHeader(r.cookies) } }), L.cfg)
    expect(s).toMatchObject({ kind: "demo", user: { persona } })
    return s!
  }
  const run = async (s: SessionCtx, intent: DemoIntent, label: string) => {
    const key = newOpKey()
    const r = await demoRelay(
      { ...L.deps, personaKey: loadKeys("DEMO_PERSONA_KEY")[0] },
      s,
      { demo: { intent }, idempotencyKey: key },
      { requestId: `req_demo_${key}`, ipnetHash: "live-demo", bodyHash: sha256Hex(key) },
    )
    if (r.body.txHash) L.hashes[label] = String(r.body.txHash)
    return r
  }

  beforeAll(async () => {
    L = await setupLive("live_demo")
  }, 60_000)
  afterAll(async () => {
    await L?.close()
    console.log("LIVE demo tx hashes:", JSON.stringify(L?.hashes, null, 2))
  })

  it("seedDemoPot (pool) through the relayer path: $450, 3 members, demo_pot ready", { timeout: 240_000 }, async () => {
    const plan = seedPlan("pool", L.cfg)
    const r = await seedDemoPot({ ...L.deps, personaKey: loadKeys("DEMO_PERSONA_KEY")[0]!, secret: secret() }, plan)
    await L.drain()
    potId = r.potId
    for (const tx of r.txs) L.hashes[`seed ${tx.step}`] = tx.txHash
    expect(r).toMatchObject({ balance: "450000000", members: 3 })
    expect(r.txs.map((x) => x.step)).toEqual(expect.arrayContaining(["create_pot", "join sam", "join leo", "add_money maya"]))
  })

  it("demo session leases the pool Pot; Maya's $84 instant spend and $300 vote spend; Leo approves → $66", { timeout: 240_000 }, async () => {
    const maya = await session("maya")
    expect(maya.demo?.potId).toBe(potId)
    const instant = await run(maya, { type: "request_spend", pot: potId, amount: $(84), receiverId: maya.user.nearAccount, category: "groceries", requestRef: newOpKey() } as DemoIntent, "demo instant $84")
    expect(instant.body).toMatchObject({ outcome: "success", result: { type: "spend", path: "instant" } })
    await L.drain()
    expect(await eventually(() => L.hub.ftBalanceOf(L.cfg.usdcId, potId), (b) => b === 366_000_000n)).toBe(366_000_000n)

    const vote = await run(maya, { type: "request_spend", pot: potId, amount: $(300), receiverId: maya.user.nearAccount, category: "stay", requestRef: newOpKey() } as DemoIntent, "demo vote $300")
    expect(vote.body).toMatchObject({ outcome: "success", result: { type: "spend", path: "vote", approvalsNeeded: 2 } })
    const pid = (vote.body.result as { proposalId: number }).proposalId
    const kind = (await L.hub.getProposal(potId, pid))!.kind as ProposalKind
    const own = await run(maya, { type: "vote", pot: potId, proposalId: pid, kind, action: "VoteApprove" } as DemoIntent, "demo vote maya")
    expect(own.body).toMatchObject({ outcome: "success", result: { proposalStatus: "InProgress" } })
    const leo = await session("leo")
    expect(leo.demo?.potId).toBe(potId) // the same lease: a persona switch
    const v = await run(leo, { type: "vote", pot: potId, proposalId: pid, kind, action: "VoteApprove" } as DemoIntent, "demo vote leo")
    expect(v.body).toMatchObject({ outcome: "success", result: { proposalStatus: "Approved", payout: "sent" } })
    await L.drain()
    expect(await eventually(() => L.hub.ftBalanceOf(L.cfg.usdcId, potId), (b) => b === 66_000_000n)).toBe(66_000_000n)
  })

  it("a demo intent on the reference Pot → demo_forbidden (checked first, nothing signed)", { timeout: 60_000 }, async () => {
    const maya = await session("maya")
    const ref = L.cfg.demoReferencePot!
    await expect(run(maya, { type: "add_money", pot: ref, amount: $(1) } as DemoIntent, "never")).rejects.toMatchObject({ reason: "demo_forbidden" })
    await expect(run(maya, { type: "add_money", pot: ref, amount: $(1) } as DemoIntent, "never")).rejects.toBeInstanceOf(ApiError)
  })

  it("GET /api/demo/state: the reference Pot from chain, the pool counts, the CLI twins", { timeout: 60_000 }, async () => {
    const s = (await demoState({ db: L.t.db, hub: L.hub, cfg: L.cfg })) as {
      reference: { potId: string; balance: string; members: { account: string; contributed: string }[]; name: string }
      pool: { ready: number; leased: number }
      commands: Record<string, string>
    }
    expect(s.reference).toMatchObject({ potId: L.cfg.demoReferencePot, name: "Lisbon Trip", balance: "450000000" })
    expect(s.reference.members.map((m) => m.contributed)).toEqual(["150000000", "150000000", "150000000"])
    expect(s.pool).toMatchObject({ leased: 1 })
    expect(s.commands.getPolicy).toBe(`near contract call-function as-read-only ${L.cfg.demoReferencePot} get_policy json-args {} network-config testnet now`)
  })
})
