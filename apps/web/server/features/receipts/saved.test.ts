// Saved receipt details (server/features/receipts/saved.ts, the route under app/api/pots/[pot]/requests/[id]/receipt)
// against a private test DB with a fake chain: only the requester saves, once, and only details whose fingerprint is
// the one the request carries in its request_ref; members read, others don't; strict validation and size caps; the
// burst / daily quotas; the feed's public `receipts` ids. Never an image.
import { vi } from "vitest"
vi.mock("server-only", () => ({}))
import { KeyPair } from "near-api-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { spendRef } from "@pot/sdk"
import { pot, spendReceipt } from "@/db/schema"
import { createTestDb, type TestDb } from "@/db/testing"
import { canonicalJson, receiptFingerprint, type SavedReceipt } from "@/lib/receipt-saved"
import { createHubReader } from "../../chain/hub"
import type { Config } from "../../config"
import { createSession, loadSession, type SessionCtx } from "../../session/store"
import { DAO, HUB } from "../../testing/delegates"
import { insertUser, seedChain, testConfig } from "../../testing/env"
import { FakeChain } from "../../testing/fakeChain"
import { getFeed } from "../feed"
import { getSpendReceipt, receiptIds, receiptSaveReq, saveSpendReceipt } from "./saved"

let t: TestDb
let cfg: Config
let chain: FakeChain
const MAYA = "maya.users.potapp.testnet"
const SAM = "sam.users.potapp.testnet"
const EVE = "eve.users.potapp.testnet" // not a member
const NOW = Date.parse("2026-10-30T12:00:00.000Z")

const RECEIPT: SavedReceipt = {
  v: 1,
  nonce: "00112233445566778899aabbccddeeff",
  merchant: "Taberna da Rua",
  date: "2026-10-29",
  currency: "EUR",
  totalCents: 4250,
  taxCents: 795,
  tipCents: 400,
  items: [
    { name: "Bacalhau à Brás", qty: 2, amountCents: 2600 },
    { name: "Caldo verde", qty: 1, amountCents: 450 },
    { name: "Imperial", qty: 2, amountCents: 800 },
  ],
  fx: { from: "EUR", amountCents: 4250, usdCents: 4612, rate: "1.0852", rateDate: "2026-10-29", source: "ecb" },
  proof: { verifyUrl: "https://cloud.near.ai/verify?model=z-ai%2Fglm-5.3-flash", reply: false, model: "z-ai/glm-5.3-flash" },
  source: "near-ai",
  readAt: "2026-10-30T11:58:00.000Z",
}
const FP = receiptFingerprint(RECEIPT)
const OP = "k3d9x1a2b4c6m7n8"

// request 0: Maya's €42.50 dinner with the fingerprint; 1: Maya's spend without one; 2: Sam's with Maya's fingerprint
const requests = () => [
  { request_id: 0, pot: DAO, requester: MAYA, receiver_id: MAYA, amount: "46120000", category: "food", request_ref: spendRef(OP, FP), path: "instant", reason: "within_rules", status: "approved", proposal_id: 1, created_at_ms: NOW, updated_at_ms: NOW, expires_at_ms: NOW },
  { request_id: 1, pot: DAO, requester: MAYA, receiver_id: MAYA, amount: "20000000", category: "groceries", request_ref: "p8w2m4q6z1x3r5t7", path: "instant", reason: "within_rules", status: "approved", proposal_id: 2, created_at_ms: NOW, updated_at_ms: NOW, expires_at_ms: NOW },
  { request_id: 2, pot: DAO, requester: SAM, receiver_id: SAM, amount: "46120000", category: "food", request_ref: spendRef("aaaaaaaaaaaaaaaa", FP), path: "instant", reason: "within_rules", status: "approved", proposal_id: 3, created_at_ms: NOW, updated_at_ms: NOW, expires_at_ms: NOW },
]

beforeAll(async () => {
  t = await createTestDb("spend_receipt")
})
afterAll(async () => {
  await t.close()
})
beforeEach(async () => {
  await t.truncate()
  for (const k of Object.keys(process.env)) if (k.startsWith("QUOTA_")) delete process.env[k]
  cfg = testConfig()
  chain = seedChain(new FakeChain())
  chain.view(HUB, "get_members", () => [MAYA, SAM].map((a) => ({ account_id: a, status: "active", contributed: "150000000" })))
  chain.view(HUB, "get_requests", (a) => requests().filter((r) => r.request_id === (a.from_index as number)))
  await t.db.insert(pot).values({ daoId: DAO, slug: "lisbon-trip", hubId: HUB, name: "Lisbon Trip", preset: "trip", creatorAccount: MAYA })
})

async function sessionFor(account: string): Promise<SessionCtx> {
  const key = KeyPair.fromRandom("ed25519")
  const { user, device } = await insertUser(t.db, { account, key })
  const s = await createSession(t.db, { userId: user.id, kind: "near-auth", deviceId: device?.id })
  return (await loadSession(t.db, new Request("https://pot.test", { headers: { cookie: `__Host-pot_session=${s.cookieValue}` } }), cfg))!
}

const deps = () => ({ db: t.db, hub: createHubReader(chain, HUB), cfg, now: () => NOW })
const save = (s: SessionCtx, receipt: unknown, id = "0") => saveSpendReceipt(deps(), s, "lisbon-trip", id, { receipt })
const read = (s: SessionCtx, id = "0") => getSpendReceipt(deps(), s, "lisbon-trip", id)

describe("save", () => {
  it("the requester saves it once (201), with the full fingerprint; the same details again replay (200)", async () => {
    const maya = await sessionFor(MAYA)
    const a = await save(maya, RECEIPT)
    expect(a.status).toBe(201)
    expect(a.res).toMatchObject({ pot: DAO, hubRequestId: 0, fingerprint: FP, receipt: RECEIPT })
    // key order on the wire doesn't matter: the fingerprint is over the canonical form
    const shuffled = JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(RECEIPT).reverse())))
    const b = await save(maya, shuffled)
    expect(b).toMatchObject({ status: 200, replayed: true })
    const rows = await t.db.select().from(spendReceipt)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ potId: DAO, requestId: 0, requesterAccount: MAYA, fingerprint: FP })
    // what's stored has the same canonical form (jsonb reorders keys)
    expect(canonicalJson(rows[0]!.data)).toBe(canonicalJson(RECEIPT))
  })

  it("an edited receipt doesn't match the fingerprint the spend carries → 422 receipt_mismatch, nothing stored", async () => {
    const maya = await sessionFor(MAYA)
    for (const edit of [{ merchant: "Somewhere else" }, { totalCents: 4251, fx: { ...RECEIPT.fx!, amountCents: 4251, usdCents: 4613 } }, { nonce: "ffffffffffffffffffffffffffffffff" }, { items: RECEIPT.items.slice(1) }])
      await expect(save(maya, { ...RECEIPT, ...edit })).rejects.toMatchObject({ reason: "payload_mismatch", status: 422, detail: { why: "receipt_mismatch" } })
    expect(await t.db.select().from(spendReceipt)).toHaveLength(0)
  })

  it("a spend sent without a fingerprint can't get details later (no_fingerprint)", async () => {
    const maya = await sessionFor(MAYA)
    await expect(save(maya, RECEIPT, "1")).rejects.toMatchObject({ reason: "payload_mismatch", detail: { why: "no_fingerprint" } })
  })

  it("only the requester attaches: another member gets action_not_allowed, even with the right details", async () => {
    const maya = await sessionFor(MAYA)
    await expect(save(maya, RECEIPT, "2")).rejects.toMatchObject({ reason: "action_not_allowed", detail: { why: "not_requester" } })
    const sam = await sessionFor(SAM)
    await expect(save(sam, RECEIPT)).rejects.toMatchObject({ reason: "action_not_allowed" })
    expect(await t.db.select().from(spendReceipt)).toHaveLength(0)
  })

  it("once: different details for a saved spend → 409 idempotency_conflict", async () => {
    const maya = await sessionFor(MAYA)
    await save(maya, RECEIPT)
    await expect(save(maya, { ...RECEIPT, merchant: "Another" })).rejects.toMatchObject({ reason: "idempotency_conflict", detail: { why: "already_saved" } })
  })

  it("outsiders, unknown Pots, bad ids, missing requests", async () => {
    const eve = await sessionFor(EVE)
    await expect(save(eve, RECEIPT)).rejects.toMatchObject({ reason: "not_a_member" })
    const maya = await sessionFor(MAYA)
    await expect(saveSpendReceipt(deps(), maya, "nope-pot", "0", { receipt: RECEIPT })).rejects.toMatchObject({ reason: "pot_unknown" })
    for (const id of ["-1", "01", "x", ""]) await expect(save(maya, RECEIPT, id)).rejects.toMatchObject({ reason: "bad_request", detail: { field: "id" } })
    await expect(save(maya, RECEIPT, "7")).rejects.toMatchObject({ reason: "not_found", detail: { field: "id" } })
  })

  it.each([
    ["an image", { ...RECEIPT, image: "/9j/4AAQSkZJRg==" }, "receipt"],
    ["an extra item field", { ...RECEIPT, items: [{ name: "x", qty: 1, amountCents: 1, photo: "a" }] }, "receipt.items.0"],
    ["floats as cents", { ...RECEIPT, totalCents: 42.5 }, "receipt.totalCents"],
    ["a merchant with control characters", { ...RECEIPT, merchant: "Shop\u0007" }, "receipt.merchant"],
    ["31 items", { ...RECEIPT, items: Array.from({ length: 31 }, () => ({ name: "x", qty: 1, amountCents: 1 })) }, "receipt.items"],
    ["a date that isn't a day", { ...RECEIPT, date: "2026-02-30" }, "receipt.date"],
    ["wrong arithmetic", { ...RECEIPT, fx: { ...RECEIPT.fx!, usdCents: 5000 } }, "receipt.fx.usdCents"],
    ["a proof link elsewhere", { ...RECEIPT, proof: { ...RECEIPT.proof!, verifyUrl: "https://evil.example/verify?model=z-ai%2Fglm-5.3-flash" } }, "receipt.proof.verifyUrl"],
    ["a reading from next week", { ...RECEIPT, readAt: "2026-11-06T00:00:00.000Z" }, "receipt.readAt"],
    ["no receipt", undefined, "receipt"],
  ])("refuses %s → 400 bad_request, nothing stored", async (_name, body, field) => {
    const maya = await sessionFor(MAYA)
    const e = (await save(maya, body).catch((x: unknown) => x)) as { reason: string; detail: { field: string } }
    expect(e).toMatchObject({ reason: "bad_request" })
    expect(e.detail.field.startsWith(field)).toBe(true)
    expect(await t.db.select().from(spendReceipt)).toHaveLength(0)
  })

  it("the POST body is {receipt} only", () => {
    expect(receiptSaveReq.safeParse({ receipt: RECEIPT }).success).toBe(true)
    expect(receiptSaveReq.safeParse({ receipt: RECEIPT, image: "x" }).success).toBe(false)
  })

  it("burst and daily caps", async () => {
    process.env.QUOTA_USER_RECEIPT_SAVE_BURST = "0"
    const maya = await sessionFor(MAYA)
    await expect(save(maya, RECEIPT)).rejects.toMatchObject({ reason: "rate_limited", status: 429 })
    delete process.env.QUOTA_USER_RECEIPT_SAVE_BURST
    process.env.QUOTA_USER_RECEIPT_SAVES = "0"
    await expect(save(maya, RECEIPT)).rejects.toMatchObject({ reason: "quota_exceeded", detail: { family: "receipt_saves" } })
    expect(await t.db.select().from(spendReceipt)).toHaveLength(0)
  })
})

describe("read", () => {
  it("members read the details; others are refused; none saved → not_found", async () => {
    const maya = await sessionFor(MAYA)
    const sam = await sessionFor(SAM)
    const eve = await sessionFor(EVE)
    await expect(read(sam)).rejects.toMatchObject({ reason: "not_found", detail: { field: "receipt" } })
    await save(maya, RECEIPT)
    const r = await read(sam)
    expect(r).toMatchObject({ hubRequestId: 0, fingerprint: FP })
    expect(canonicalJson(r.receipt)).toBe(canonicalJson(RECEIPT))
    expect(receiptFingerprint(r.receipt)).toBe(FP)
    await expect(read(eve)).rejects.toMatchObject({ reason: "not_a_member" })
  })

  it("the feed tells everyone which spends have details (ids only), members and visitors alike", async () => {
    const maya = await sessionFor(MAYA)
    await save(maya, RECEIPT)
    expect(await receiptIds(t.db, DAO)).toEqual(["0"])
    const hub = createHubReader(chain, HUB)
    const anon = await getFeed({ db: t.db, hub, cfg }, null, "lisbon-trip", {})
    expect(anon.body.receipts).toEqual(["0"])
    expect(JSON.stringify(anon.body)).not.toContain("Taberna")
    const member = await getFeed({ db: t.db, hub, cfg }, maya, "lisbon-trip", {})
    expect(member.body.receipts).toEqual(["0"])
  })
})
