// hub 1.1.0 pushes: "Sam needs one OK" to the others, "Approved … Sam gave the OK" to the requester, "You're now
// Trusted in Lisbon Trip: up to $200", and the goal (reached / missed → refunding / everyone got their money back,
// which replaces "Pot closed"). The event mapping is pure; the copy is checked through notify() with a scripted sender.
import { vi } from "vitest"
vi.mock("server-only", () => ({}))
import { createECDH, randomBytes } from "node:crypto"
import { KeyPair } from "near-api-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { pot } from "@/db/schema"
import { createTestDb, type TestDb } from "@/db/testing"
import { createHubReader } from "../chain/hub"
import type { RawEvent } from "../chain/outcome"
import type { Config } from "../config"
import { createSession, loadSession } from "../session/store"
import { DAO, HUB } from "../testing/delegates"
import { insertUser, potView, seedChain, testConfig } from "../testing/env"
import { FakeChain } from "../testing/fakeChain"
import { eventKey, eventsToNotifications, notify, type NotifyDeps } from "./notify"
import { saveSubscription } from "./subscriptions"
import type { PushResult, PushSender } from "./webpush"

const MAYA = "maya.users.potapp.testnet"
const SAM = "sam.users.potapp.testnet"
const LEO = "leo.users.potapp.testnet"
const ev = (event: string, data: Record<string, unknown>): RawEvent => ({ standard: "pot", version: "1.1.0", event, data: { pot: DAO, ...data }, executor: HUB, receiptId: "r" }) as RawEvent

describe("hub 1.1.0 events → notifications", () => {
  it("a one-OK request asks the others for one OK; the OK resolves it for the requester", () => {
    const out = eventsToNotifications(
      [
        ev("spend_requested", { path: "vote", tier: "one_ok", proposal_id: 4, requester: SAM, amount: "180000000", category: "stay" }),
        ev("spend_ok_approved", { request_id: 2, proposal_id: 4, requester: SAM, by: MAYA, amount: "180000000" }),
      ],
      "TX",
    )
    expect(out).toEqual([
      { type: "approval_needed", subject: "spend", pot: DAO, proposalId: 4, actor: SAM, amount: "180000000", category: "stay", tier: "one_ok" },
      { type: "request_resolved", pot: DAO, proposalId: 4, requester: SAM, status: "approved", amount: "180000000", okBy: MAYA },
    ])
    // the same resolution key as the hub's own sync (one push, whichever lands first)
    expect(eventKey(out[1]!)).toBe(`resolved:${DAO}:4:approved`)
  })

  it("trust: only a level up from a paid spend pushes (never a decline)", () => {
    const out = eventsToNotifications(
      [
        ev("trust_level_changed", { member: MAYA, from: 0, to: 1, settled: 3, declined: 0, cause: "settled" }),
        ev("trust_level_changed", { member: SAM, from: 1, to: 0, settled: 3, declined: 1, cause: "declined" }),
      ],
      "TX",
    )
    expect(out).toEqual([{ type: "trust_up", pot: DAO, member: MAYA, level: 1 }])
    expect(eventKey(out[0]!)).toBe(`trust:${DAO}:${MAYA}:1`)
  })

  it("goal: reached → everyone; refund proposed → missed; refunded replaces the Pot-closed push for its payees", () => {
    expect(eventsToNotifications([ev("goal_reached", { goal: { amount: "1200000000", deadline_ms: 1, all_or_nothing: true }, total: "1200000000" })], "TX")).toEqual([
      { type: "goal", pot: DAO, state: "reached", goal: "1200000000" },
    ])
    expect(eventsToNotifications([ev("goal_refund_proposed", { proposal_id: 9 })], "TX")).toEqual([{ type: "goal", pot: DAO, state: "missed" }])
    const done = eventsToNotifications(
      [ev("goal_refunded", { proposal_id: 9 }), ev("pot_closed", { payouts: [{ account_id: MAYA, amount: "1" }, { account_id: LEO, amount: "2" }] })],
      "TX",
    )
    expect(done).toEqual([{ type: "goal", pot: DAO, state: "refunded", recipients: [MAYA, LEO] }])
    // a normal close still says "Pot closed"
    expect(eventsToNotifications([ev("pot_closed", { payouts: [{ account_id: MAYA }] })], "TX")[0]).toMatchObject({ type: "pot_closed" })
  })
})

// ------------------------------------------------------------------------------------------------- copy

let t: TestDb
let cfg: Config
let chain: FakeChain
class Sender implements PushSender {
  sent: { endpoint: string; json: string }[] = []
  async send(target: { endpoint: string }, json: string): Promise<PushResult> {
    this.sent.push({ endpoint: target.endpoint, json })
    return { status: 201 }
  }
}

beforeAll(async () => {
  t = await createTestDb("notify_wave4")
})
afterAll(async () => {
  await t.close()
})
beforeEach(async () => {
  await t.truncate()
  cfg = testConfig()
  chain = seedChain(new FakeChain())
  chain.view(HUB, "get_members", () => [MAYA, SAM, LEO].map((a) => ({ account_id: a, status: "active", contributed: "150000000" })))
  chain.view(HUB, "get_pot", () => potView())
  chain.view(DAO, "get_proposal", () => ({ id: 4, kind: {}, status: "InProgress", votes: { [SAM]: "Approve" }, submission_time: `${Date.now()}000000` }))
  await t.db.insert(pot).values({ daoId: DAO, slug: "lisbon-trip", hubId: HUB, name: "Lisbon Trip", preset: "trip", creatorAccount: MAYA })
})

async function subscribed(account: string, name: string, endpoint: string) {
  const key = KeyPair.fromRandom("ed25519")
  const { user, device } = await insertUser(t.db, { account, key, kind: "near-auth", deviceStatus: "active" })
  await t.db.execute(`UPDATE app_user SET display_name = '${name}' WHERE id = '${user.id}'` as never)
  const s = await createSession(t.db, { userId: user.id, kind: "near-auth", deviceId: device?.id })
  const ctx = (await loadSession(t.db, new Request("https://pot.test", { headers: { cookie: `__Host-pot_session=${s.cookieValue}` } }), cfg))!
  const ecdh = createECDH("prime256v1")
  ecdh.generateKeys()
  await saveSubscription(t.db, ctx, {
    subscription: { endpoint, expirationTime: null, keys: { p256dh: ecdh.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url") } },
    standalone: true,
    platform: "ios",
  })
}

const deps = (sender: PushSender): NotifyDeps => ({ db: t.db, hub: createHubReader(chain, HUB), cfg, sender, sleep: async () => undefined })
const titles = (s: Sender) => s.sent.map((x) => JSON.parse(x.json).notification as { title: string; body?: string; navigate: string })

describe("hub 1.1.0 push copy (lock-screen safe)", () => {
  beforeEach(async () => {
    await subscribed(MAYA, "Maya", "https://fcm.googleapis.com/fcm/send/maya")
    await subscribed(SAM, "Sam", "https://fcm.googleapis.com/fcm/send/sam")
    await subscribed(LEO, "Leo", "https://fcm.googleapis.com/fcm/send/leo")
  })

  it("one OK needed: to everyone but the requester and those who already answered", async () => {
    const s = new Sender()
    await notify(deps(s), { type: "approval_needed", subject: "spend", pot: DAO, proposalId: 4, actor: MAYA, amount: "180000000", category: "stay", tier: "one_ok" })
    expect(s.sent.map((x) => x.endpoint)).toEqual(["https://fcm.googleapis.com/fcm/send/leo"]) // Sam already voted, Maya asked
    expect(titles(s)[0]).toMatchObject({ title: "Maya needs one OK", body: "$180 for a place to stay · Lisbon Trip · Anyone who has added money can OK it" })
  })

  it("approved by an OK: to the requester, naming who gave it", async () => {
    const s = new Sender()
    await notify(deps(s), { type: "request_resolved", pot: DAO, proposalId: 4, requester: SAM, status: "approved", amount: "180000000", category: "stay", okBy: MAYA })
    expect(titles(s)).toEqual([expect.objectContaining({ title: "Approved: $180 is on its way", body: "Maya gave the OK for a place to stay." })])
  })

  it("trust up: 'You're now Trusted in Lisbon Trip' with the new limit (instant limit × 2)", async () => {
    const s = new Sender()
    await notify(deps(s), { type: "trust_up", pot: DAO, member: MAYA, level: 1 })
    expect(s.sent.map((x) => x.endpoint)).toEqual(["https://fcm.googleapis.com/fcm/send/maya"])
    expect(titles(s)[0]).toMatchObject({ title: "You're now Trusted in Lisbon Trip", body: `You can spend up to $${Number(BigInt(potView().rules.instant_cap) * 2n) / 1e6} without asking.` })
    expect(titles(s)[0]!.navigate).toMatch(/\/p\/lisbon-trip\?tab=rules$/)
  })

  it("goal reached / missed / refunded", async () => {
    const s = new Sender()
    await notify(deps(s), { type: "goal", pot: DAO, state: "reached", goal: "1200000000" })
    await notify(deps(s), { type: "goal", pot: DAO, state: "missed" })
    await notify(deps(s), { type: "goal", pot: DAO, state: "refunded", recipients: [MAYA] })
    const got = titles(s).map((n) => [n.title, n.body])
    expect(got.slice(0, 3)).toEqual(Array(3).fill(["Lisbon Trip reached its goal", "$1,200 collected. Spending is open."]))
    expect(got.slice(3, 6)).toEqual(Array(3).fill(["Lisbon Trip didn't reach its goal", "Everyone's getting their money back."]))
    expect(got.slice(6)).toEqual([["Everyone got their money back", "Lisbon Trip didn't reach its goal. Your share is back in your Pot account."]])
    // never an account id on the lock screen (the Pot id rides in data, for the deep link only)
    for (const n of titles(s)) expect(`${n.title} ${n.body ?? ""}`).not.toMatch(/users\.potapp|\.testnet/)
  })
})
