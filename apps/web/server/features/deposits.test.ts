// Money-in details (server/features/deposits.ts, GET /api/pots/[pot]/deposits/[key]) against a private schema with a
// fake chain, through the real route with cookies: members only (a stranger, someone who left and an unknown key get
// the same 404; signed out 401), and the mapping of each source: demo dollars / Pot dollars (kept on the add's feed
// row by POST /api/relay), a faucet claim just before (older adds), "from their balance", another app (the ADDED
// deposit via relay_log, or the one named in the relay's context; simulated: no origin link, no NEAR Intents page;
// real: both, with the trail's times), a pay-in (name, note, link), the top-up ask it answered, and the feed's
// addSources (members only).
import { vi } from "vitest"
vi.mock("server-only", () => ({}))
import { sha256 } from "@noble/hashes/sha2.js"
import { base58 } from "@scure/base"
import { eq } from "drizzle-orm"
import { KeyPair } from "near-api-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { setDbForTests } from "@/db/client"
import { appUser, depositIntent, feedEvent, gift, giftLink, pot, relayLog, topupRequest } from "@/db/schema"
import { createTestDb, type TestDb } from "@/db/testing"
import type { DepositDetailsRes, DepositDetailsWire } from "@/lib/deposits-api"
import { createHubReader } from "../chain/hub"
import { setConfigForTests } from "../config"
import { setHubForTests } from "../deps"
import { createSession } from "../session/store"
import { DAO, HUB } from "../testing/delegates"
import { insertUser, seedChain, testConfig } from "../testing/env"
import { FakeChain } from "../testing/fakeChain"
import { noteAddSource, xcSourceOf } from "./deposits"
import { nextTrail } from "./oneclick/service"

const MAYA = "maya.users.potapp.testnet"
const SAM = "sam.users.potapp.testnet"
const EVE = "eve.users.potapp.testnet" // never in the Pot
const LEO = "leo.users.potapp.testnet" // was in the Pot, left
const ALEX = "alex.users.potapp.testnet" // paid in from outside
const TX = (n: number) => base58.encode(sha256(new TextEncoder().encode(`deposits-test-${n}`)))
const at = (min: number, sec = 0) => new Date(Date.UTC(2026, 10, 4, 9, min, sec))
const REF = "g0000000000000000000ax01"
const LINK = "bdayOpenGiftLink000001"
const SECRET_NOTE = "SECRET-NOTE-for-the-cake"

let t: TestDb
let members: string[]
const cookies: Record<string, string> = {}
const ids: Record<string, string> = {}

function resetHub() {
  const chain = seedChain(new FakeChain())
  chain.view(HUB, "get_members", () => members.map((account_id) => ({ account_id, status: "active", contributed: "150000000" })))
  setHubForTests(createHubReader(chain, HUB))
}

async function user(account: string, name: string) {
  const { user: u, device } = await insertUser(t.db, { account, key: KeyPair.fromRandom("ed25519") })
  await t.db.update(appUser).set({ displayName: name }).where(eq(appUser.id, u.id))
  const c = await createSession(t.db, { userId: u.id, kind: "near-auth", deviceId: device?.id })
  cookies[account] = `__Host-pot_session=${c.cookieValue}`
  ids[account] = u.id
  return u
}

let rid = 0
const add = (n: number, actor: string, amount: string, min: number, data: Record<string, unknown> = {}) => ({
  potId: DAO,
  kind: "contribution" as const,
  key: `contribution:${TX(n)}`,
  actor,
  amount,
  txHash: TX(n),
  receiptId: `r${++rid}`,
  eventIndex: 0,
  at: at(min),
  data,
  source: "relay" as const,
})
const relayAdd = (n: number, userId: string, sender: string, min: number) => ({
  id: `rl_${String(n).padStart(26, "0")}`,
  requestId: `req_${n}`,
  userId,
  op: "relay" as const,
  intent: "add_money",
  senderId: sender,
  receiverId: "usdc.potapp.testnet",
  potId: DAO,
  outerTxHash: TX(n),
  status: "executed" as const,
  outcome: "success" as const,
  result: { type: "contribution", recorded: true, amount: "1" },
  createdAt: at(min),
})
const intent = (id: string, o: Partial<typeof depositIntent.$inferInsert> = {}) => ({
  id,
  userId: ids[MAYA]!,
  potId: DAO,
  idempotencyKey: `k-${id}`,
  mode: "simulated" as const,
  chain: "base" as const,
  recipient: MAYA,
  amountIn: "8625000000000000",
  minAmountIn: "8366250000000000",
  amountOutQuoted: "20000000",
  depositAddress: `SIMULATED-base-${id.slice(-8)}`,
  quote: { origin: { coin: "ETH", decimals: 18, stable: false, assetId: "nep141:base.omft.near" }, usdTarget: "20000000", __sim: { scenario: "ok", jitter: 1, sends: [{ at: at(10, 20).getTime(), amount: "8625000000000000" }] } },
  deadline: at(130),
  status: "ADDED" as const,
  depositedAmount: "8625000000000000",
  amountOut: "20000000",
  createdAt: at(10),
  ...o,
})

beforeAll(async () => {
  t = await createTestDb("deposits")
  setDbForTests(t.db)
})
afterAll(async () => {
  setDbForTests(undefined)
  setHubForTests(undefined)
  setConfigForTests(undefined)
  await t.close()
})
beforeEach(async () => {
  await t.truncate()
  testConfig()
  members = [MAYA, SAM]
  resetHub()
  await t.db.insert(pot).values({ daoId: DAO, slug: "lisbon-trip", hubId: HUB, name: "Lisbon Trip", preset: "trip", creatorAccount: MAYA })
  await user(MAYA, "Maya Chosen")
  await user(SAM, "Sam Chosen")
  await user(EVE, "Eve Outsider")
  await user(LEO, "Leo Chosen")
  await user(ALEX, "Alex Account")
})

const ORIGIN = "https://pot.test"
const params = <P,>(p: P) => ({ params: Promise.resolve(p) })
async function details(who: string | null, key: string, potParam = "lisbon-trip") {
  const { GET } = await import("@/app/api/pots/[pot]/deposits/[key]/route")
  const r = await GET(new Request(`${ORIGIN}/api/pots/${potParam}/deposits/${key}`, { headers: who ? { cookie: cookies[who]! } : {} }), params({ pot: potParam, key }))
  return { status: r.status, cache: r.headers.get("cache-control"), body: (await r.json()) as DepositDetailsRes & { reason?: string } }
}
const ok = async (key: string, who = MAYA): Promise<DepositDetailsWire> => {
  const r = await details(who, key)
  expect(r.status).toBe(200)
  return r.body.deposit
}

describe("who may read it", () => {
  it("a member gets it (private, no-store); a stranger, someone who left, an unknown key and another Pot's key get the same 404; signed out 401", async () => {
    await t.db.insert(feedEvent).values(add(1, SAM, "150000000", 1, { potSource: "demo" }))
    await t.db.insert(gift).values({ ref: REF, potId: DAO, giverAccount: ALEX, displayName: "Alex", note: SECRET_NOTE, amount: "25000000", status: "received", tone: "payment", txHash: TX(9), receivedAt: at(3) })
    const m = await details(MAYA, TX(1))
    expect(m).toMatchObject({ status: 200, cache: "private, no-store" })
    expect(m.body.deposit).toMatchObject({ kind: "added", who: SAM, amount: "150000000", source: { kind: "demo" }, txHash: TX(1) })
    expect(m.body.profiles[SAM]).toEqual({ name: "Sam Chosen" })
    expect((await details(MAYA, REF)).body.deposit.source).toMatchObject({ kind: "payin", note: SECRET_NOTE })

    // Leo while he's in the Pot, then after he left
    members = [MAYA, SAM, LEO]
    resetHub()
    expect((await details(LEO, REF)).status).toBe(200)
    members = [MAYA, SAM]
    resetHub()
    for (const who of [EVE, LEO]) {
      for (const key of [TX(1), REF, TX(77), "not-a-key"]) {
        const r = await details(who, key)
        expect(r).toMatchObject({ status: 404, body: { reason: "not_found" } })
        expect(JSON.stringify(r.body)).not.toContain(SECRET_NOTE)
        expect(JSON.stringify(r.body)).not.toContain("Sam Chosen")
      }
    }
    // a member asking for a key that doesn't exist (or is another Pot's) gets the same 404
    expect((await details(MAYA, TX(77))).status).toBe(404)
    expect((await details(MAYA, "g00000000000000000000000")).status).toBe(404)
    expect((await details(MAYA, TX(1), "porto-weekend")).status).toBe(404)
    expect(await details(null, TX(1))).toMatchObject({ status: 401, body: { reason: "not_signed_in" } })
  })
})

describe("where the money came from", () => {
  it("demo dollars / Pot dollars as the Add sheet sent them (kept on the feed row by the relay)", async () => {
    await t.db.insert(relayLog).values([relayAdd(1, ids[SAM]!, SAM, 1), relayAdd(2, ids[MAYA]!, MAYA, 2)])
    await t.db.insert(feedEvent).values([add(1, SAM, "150000000", 1), add(2, MAYA, "50000000", 2)])
    await noteAddSource(t.db, { userId: ids[SAM]!, relayId: relayAdd(1, "", "", 0).id, txHash: TX(1), source: "demo" })
    await noteAddSource(t.db, { userId: ids[MAYA]!, relayId: relayAdd(2, "", "", 0).id, txHash: TX(2), source: "pot_dollars" })
    // someone else's relay id can't write on it
    await noteAddSource(t.db, { userId: ids[EVE]!, relayId: relayAdd(1, "", "", 0).id, txHash: TX(1), source: "pot_dollars" })
    expect((await ok(TX(1))).source).toEqual({ kind: "demo" })
    expect((await ok(TX(2))).source).toEqual({ kind: "pot_dollars" })
  })

  it("an older add: a faucet claim by the same person within 10 minutes before = demo dollars, else 'their balance'", async () => {
    await t.db.insert(relayLog).values([
      relayAdd(1, ids[SAM]!, SAM, 20),
      relayAdd(2, ids[SAM]!, SAM, 60),
      { id: `rl_${"f".repeat(26)}`, requestId: "req_f", userId: ids[SAM]!, op: "faucet", senderId: "treasury.potapp.testnet", receiverId: "usdc.potapp.testnet", status: "executed", createdAt: at(15) },
    ])
    await t.db.insert(feedEvent).values([add(1, SAM, "150000000", 20), add(2, SAM, "10000000", 60)])
    expect((await ok(TX(1))).source).toEqual({ kind: "demo" })
    expect((await ok(TX(2))).source).toEqual({ kind: "balance" })
  })

  it("another app, simulated (testnet demo): coin, network, sent, arrived, the five moments; no origin link, no NEAR Intents page", async () => {
    await t.db.insert(relayLog).values(relayAdd(3, ids[MAYA]!, MAYA, 12))
    await t.db.insert(feedEvent).values(add(3, MAYA, "20000000", 12))
    await t.db.insert(depositIntent).values(intent("dp_0000000000000000000000sim1", { addedRelayId: relayAdd(3, "", "", 0).id, addedAt: at(12) }))
    const d = await ok(TX(3))
    expect(d.source).toMatchObject({ kind: "xc", mode: "simulated", chain: "base", coin: "ETH", decimals: 18, stable: false, sent: "8625000000000000", arrived: "20000000", usdTarget: "20000000", originTx: null, intentsUrl: null })
    const s = d.source as Extract<DepositDetailsWire["source"], { kind: "xc" }>
    expect(s.timeline.map((x) => x.step)).toEqual(["address", "sent", "converting", "arrived", "added"])
    const times = s.timeline.map((x) => (x.at ? Date.parse(x.at) : null))
    expect(times.every((x) => x !== null)).toBe(true)
    expect(times[0]).toBe(at(10).getTime())
    expect(times[1]).toBe(at(10, 20).getTime())
    expect(times[4]).toBe(at(12).getTime())
    // in order
    for (let i = 1; i < times.length; i++) expect(times[i]!).toBeGreaterThanOrEqual(times[i - 1]!)
  })

  it("another app found through the relay's context (the deposit wasn't marked ADDED), only the person's own deposit", async () => {
    await t.db.insert(relayLog).values([relayAdd(4, ids[MAYA]!, MAYA, 30), relayAdd(5, ids[SAM]!, SAM, 31)])
    await t.db.insert(feedEvent).values([add(4, MAYA, "20000000", 30), add(5, SAM, "20000000", 31)])
    await t.db.insert(depositIntent).values(intent("dp_0000000000000000000000ctx1", { status: "SUCCESS" }))
    await noteAddSource(t.db, { userId: ids[MAYA]!, relayId: relayAdd(4, "", "", 0).id, txHash: TX(4), source: "pot_dollars", depositIntentId: "dp_0000000000000000000000ctx1" })
    // Sam names Maya's deposit: not his, not kept
    await noteAddSource(t.db, { userId: ids[SAM]!, relayId: relayAdd(5, "", "", 0).id, txHash: TX(5), source: "pot_dollars", depositIntentId: "dp_0000000000000000000000ctx1" })
    expect((await ok(TX(4))).source).toMatchObject({ kind: "xc", coin: "ETH" })
    expect((await ok(TX(5))).source).toEqual({ kind: "pot_dollars" })
  })

  it("another app, real: the origin transaction on its network's explorer, NEAR Intents' page, the trail's times, a refund", async () => {
    await t.db.insert(relayLog).values(relayAdd(6, ids[MAYA]!, MAYA, 50))
    await t.db.insert(feedEvent).values(add(6, MAYA, "20000000", 50))
    let trail = nextTrail(null, "KNOWN_DEPOSIT_TX", at(41), ["0xabc123def4567890abc123def4567890"])
    trail = nextTrail(trail, "PROCESSING", at(42))
    trail = nextTrail(trail, "PROCESSING", at(43)) // first seen is kept
    trail = nextTrail(trail, "SUCCESS", at(44))
    await t.db.insert(depositIntent).values(
      intent("dp_0000000000000000000000rea1", {
        mode: "real",
        depositAddress: "0xDepositAddr0001",
        quote: { origin: { coin: "USDC", decimals: 6, stable: true, assetId: "x" }, usdTarget: "20000000" },
        amountIn: "20000000",
        depositedAmount: "20500000",
        refundedAmount: "500000",
        refundReason: "EXCESS",
        processingSince: at(42),
        lastStatus: trail,
        addedRelayId: relayAdd(6, "", "", 0).id,
        addedAt: at(50),
        createdAt: at(40),
      }),
    )
    const s = (await ok(TX(6))).source as Extract<DepositDetailsWire["source"], { kind: "xc" }>
    expect(s).toMatchObject({ mode: "real", coin: "USDC", stable: true, sent: "20500000", refunded: "500000", refundReason: "EXCESS" })
    expect(s.originTx).toEqual({ hash: "0xabc123def4567890abc123def4567890", url: "https://basescan.org/tx/0xabc123def4567890abc123def4567890" })
    expect(s.intentsUrl).toBe("https://explorer.near-intents.org/transactions/0xDepositAddr0001")
    expect(s.timeline.map((x) => x.at)).toEqual([at(40), at(41), at(42), at(44), at(50)].map((d) => d.toISOString()))
  })

  it("a pay-in: the payer's chosen name, note, tone and the link (with who made it); a page pay-in has no link", async () => {
    await t.db.insert(giftLink).values({ id: LINK, potId: DAO, createdBy: SAM, amount: "25000000", tone: "payment", expiresAt: at(1000) })
    await t.db.insert(gift).values([
      { ref: REF, potId: DAO, linkId: LINK, giverAccount: ALEX, displayName: "Alex", note: SECRET_NOTE, amount: "25000000", status: "received", tone: "payment", txHash: TX(9), receivedAt: at(3) },
      { ref: "g0000000000000000000ana1", potId: DAO, giverAccount: ALEX, amount: "10000000", status: "pending", tone: "gift", showPublic: true },
    ])
    const r = await details(MAYA, REF)
    expect(r.body.deposit).toMatchObject({ kind: "payin", who: ALEX, amount: "25000000", status: "added", txHash: TX(9), topup: null })
    expect(r.body.deposit.source).toEqual({
      kind: "payin",
      tone: "payment",
      from: ALEX,
      name: "Alex",
      note: SECRET_NOTE,
      showPublic: false,
      link: { id: LINK, createdBy: SAM, amount: "25000000", createdAt: expect.any(String) },
    })
    expect(r.body.profiles[SAM]).toEqual({ name: "Sam Chosen" })
    const page = await ok("g0000000000000000000ana1")
    expect(page).toMatchObject({ status: "pending", source: { kind: "payin", tone: "gift", link: null, showPublic: true } })
  })

  it("an add made while a top-up ask was open, by someone it asked, names the ask; one before or after it doesn't", async () => {
    await t.db.insert(topupRequest).values({
      potId: DAO,
      createdBy: MAYA,
      mode: "each",
      perPerson: "50000000",
      total: "100000000",
      dueAt: at(100),
      baselines: [
        { a: MAYA, c: "150000000" },
        { a: SAM, c: "150000000" },
      ],
      createdAt: at(10),
      closedAt: at(70),
      closeCause: "done",
    })
    await t.db.insert(feedEvent).values([add(7, SAM, "50000000", 20, { potSource: "demo" }), add(8, SAM, "5000000", 5, { potSource: "demo" }), add(10, SAM, "5000000", 80, { potSource: "demo" })])
    const d = await ok(TX(7))
    expect(d.topup).toMatchObject({ by: MAYA, perPerson: "50000000", mode: "each" })
    expect((await ok(TX(8))).topup).toBeNull()
    expect((await ok(TX(10))).topup).toBeNull()
  })
})

describe("the feed's addSources (the rows' source line)", () => {
  it("members get each add's source (demo / Pot dollars / another app with coin + network); others none", async () => {
    await t.db.insert(relayLog).values(relayAdd(3, ids[MAYA]!, MAYA, 12))
    await t.db.insert(feedEvent).values([add(1, SAM, "150000000", 1, { potSource: "demo" }), add(2, MAYA, "1000000", 2, { potSource: "pot_dollars" }), add(3, MAYA, "20000000", 12)])
    await t.db.insert(depositIntent).values(intent("dp_0000000000000000000000sim1", { addedRelayId: relayAdd(3, "", "", 0).id, addedAt: at(12) }))
    const { GET } = await import("@/app/api/pots/[pot]/feed/route")
    const feed = async (who: string | null) => (await (await GET(new Request(`${ORIGIN}/api/pots/lisbon-trip/feed`, { headers: who ? { cookie: cookies[who]! } : {} }), params({ pot: "lisbon-trip" }))).json()) as Record<string, unknown>
    expect((await feed(MAYA)).addSources).toEqual({ [TX(1)]: { kind: "demo" }, [TX(2)]: { kind: "pot_dollars" }, [TX(3)]: { kind: "xc", chain: "base", coin: "ETH" } })
    for (const who of [EVE, null]) expect((await feed(who)).addSources).toBeUndefined()
  })
})

describe("xcSourceOf (pure)", () => {
  it("an older simulated row without a trail still gets its moments from the simulator", () => {
    const row = { ...intent("dp_0000000000000000000000old1"), lastStatus: null, processingSince: null, addedRelayId: null, addedAt: null, updatedAt: at(12), minAmountIn: null, amountOutQuoted: null, depositMemo: null, correlationId: null, quoteSignature: null, refundedAmount: null, refundReason: null, destinationTxHash: null, lastPolledAt: null, workflowRunId: null, simScenario: "ok", simStartedAt: null } as never
    const s = xcSourceOf(row, at(12))
    expect(s.timeline.filter((x) => x.at === null).map((x) => x.step)).toEqual([])
    expect(s.originTx).toBeNull()
  })
})
