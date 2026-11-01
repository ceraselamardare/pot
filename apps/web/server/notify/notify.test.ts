// X-06 notifications: payload builder (≤ 2,500 B, topics, badge), the SSRF host allowlist, subscription
// storage rules, the fan-out (recipients, dedupe, 404/410/429/5xx handling) with a scripted sender, the event
// mapping, and an INTEGRATION test against a local mock push service that decrypts what web-push sent.
import { vi } from "vitest"
vi.mock("server-only", () => ({}))
import { createECDH, randomBytes } from "node:crypto"
import { createServer, type IncomingMessage, type Server } from "node:http"
import { createRequire } from "node:module"
import type { AddressInfo } from "node:net"
import { eq } from "drizzle-orm"
import { KeyPair } from "near-api-js"
import webpush from "web-push"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { notificationLog, pot, pushSubscription } from "@/db/schema"
import { createTestDb, type TestDb } from "@/db/testing"
import { createHubReader } from "../chain/hub"
import type { RawEvent } from "../chain/outcome"
import type { Config } from "../config"
import { createSession, loadSession, type SessionCtx } from "../session/store"
import { DAO, HUB } from "../testing/delegates"
import { insertUser, seedChain, testConfig } from "../testing/env"
import { FakeChain } from "../testing/fakeChain"
import { eventsToNotifications, notify, notifyFromEvents, type NotifyDeps } from "./notify"
import { buildPayload, MAX_PAYLOAD_BYTES, topic } from "./payload"
import { deleteSubscription, pushHostAllowed, saveSubscription } from "./subscriptions"
import { createWebPushSender, type PushResult, type PushSender } from "./webpush"

let t: TestDb
let cfg: Config
let chain: FakeChain
const MAYA = "maya.users.potapp.testnet"
const SAM = "sam.users.potapp.testnet"
const LEO = "leo.users.potapp.testnet"

beforeAll(async () => {
  t = await createTestDb("notify")
})
afterAll(async () => {
  await t.close()
})
beforeEach(async () => {
  await t.truncate()
  cfg = testConfig()
  chain = seedChain(new FakeChain())
  chain.view(HUB, "get_members", () => [MAYA, SAM, LEO].map((a) => ({ account_id: a, status: "active", contributed: "150000000" })))
  chain.view(DAO, "get_proposal", () => ({ id: 3, kind: {}, status: "InProgress", votes: { [SAM]: "Approve" }, submission_time: `${Date.now()}000000` }))
  await t.db.insert(pot).values({ daoId: DAO, slug: "lisbon-trip", hubId: HUB, name: "Lisbon Trip", preset: "trip", creatorAccount: MAYA })
})

/** A browser-like subscription: P-256 key pair + 16-byte auth secret (what PushManager.subscribe returns). */
function browserKeys() {
  const ecdh = createECDH("prime256v1")
  ecdh.generateKeys()
  const auth = randomBytes(16)
  return { ecdh, auth, p256dh: ecdh.getPublicKey().toString("base64url"), authB64: auth.toString("base64url") }
}

async function sessionFor(account: string, name = "Maya", kind: "dev" = "dev", deviceStatus: "active" | "pending" = "active"): Promise<SessionCtx> {
  const key = KeyPair.fromRandom("ed25519")
  const { user, device } = await insertUser(t.db, { account, key, kind: "dev", deviceStatus })
  if (name !== "Maya") await t.db.execute(`UPDATE app_user SET display_name = '${name}' WHERE id = '${user.id}'` as never)
  const s = await createSession(t.db, { userId: user.id, kind, deviceId: device?.id })
  return (await loadSession(t.db, new Request("https://pot.test", { headers: { cookie: `__Host-pot_session=${s.cookieValue}` } }), cfg))!
}

class ScriptedSender implements PushSender {
  sent: { endpoint: string; json: string; opts: unknown }[] = []
  constructor(public answer: (endpoint: string, n: number) => PushResult = () => ({ status: 201 })) {}
  async send(target: { endpoint: string }, json: string, opts: unknown) {
    this.sent.push({ endpoint: target.endpoint, json, opts })
    return this.answer(target.endpoint, this.sent.length)
  }
}

const deps = (sender: PushSender | null): NotifyDeps => ({ db: t.db, hub: createHubReader(chain, HUB), cfg, sender, sleep: async () => undefined })

async function subscribe(s: SessionCtx, endpoint: string) {
  const k = browserKeys()
  await saveSubscription(t.db, s, { subscription: { endpoint, expirationTime: null, keys: { p256dh: k.p256dh, auth: k.authB64 } }, standalone: true, platform: "ios" })
  return k
}

// ---------------------------------------------------------------------------------------------

describe("payload (api-spec §6.2)", () => {
  it("is Declarative Web Push JSON with title, absolute navigate, tag and the badge in both places", () => {
    const { json, payload } = buildPayload({
      type: "approval_needed",
      title: "Maya needs your OK",
      body: "$300 for tickets · Lisbon Trip",
      navigate: "https://pot.test/p/lisbon-trip?r=12",
      tag: topic(DAO, 12),
      badge: 2,
      data: { pot: DAO, proposalId: 12 },
    })
    expect(payload).toMatchObject({ web_push: 8030, app_badge: 2, mutable: false, notification: { title: "Maya needs your OK", navigate: "https://pot.test/p/lisbon-trip?r=12", app_badge: 2, lang: "en-US", dir: "ltr" } })
    expect(payload.notification.data).toMatchObject({ type: "approval_needed", pot: DAO, proposalId: 12, url: "https://pot.test/p/lisbon-trip?r=12" })
    expect(Buffer.byteLength(json)).toBeLessThanOrEqual(MAX_PAYLOAD_BYTES)
  })

  it("no badge on money_arrived; a huge body is cut to fit 2,500 B", () => {
    const { json, payload } = buildPayload({ type: "money_arrived", title: "Sam added $150", body: "é".repeat(4000), navigate: "https://pot.test/p/x", badge: 3 })
    expect(payload.app_badge).toBeUndefined()
    expect(payload.notification.app_badge).toBeUndefined()
    expect(Buffer.byteLength(json)).toBeLessThanOrEqual(MAX_PAYLOAD_BYTES)
    expect(payload.notification.body!.endsWith("…")).toBe(true)
  })

  it("refuses an empty title or a relative navigate", () => {
    expect(() => buildPayload({ type: "pot_closed", title: " ", navigate: "https://pot.test/" })).toThrow()
    expect(() => buildPayload({ type: "pot_closed", title: "x", navigate: "/p/x" })).toThrow()
  })

  it("topic = r + 20 base64url chars (≤ 32, URL-safe, Apple)", () => {
    const tp = topic(DAO, 12)
    expect(tp).toMatch(/^r[A-Za-z0-9_-]{20}$/)
    expect(topic(DAO, 12)).toBe(tp)
    expect(topic(DAO, 13)).not.toBe(tp)
  })
})

describe("subscriptions (api-spec §2.6, SSRF guard)", () => {
  it("allows only the push services over https", () => {
    for (const ok of [
      "https://fcm.googleapis.com/fcm/send/abc",
      "https://web.push.apple.com/QGz",
      "https://updates.push.services.mozilla.com/wpush/v2/x",
      "https://push.services.mozilla.com/x",
      "https://wns2-par02p.notify.windows.com/w/?token=x",
    ])
      expect(pushHostAllowed(ok), ok).toBe(true)
    for (const bad of [
      "http://fcm.googleapis.com/x",
      "https://push.apple.com.evil.com/x",
      "https://evil.com/fcm.googleapis.com",
      "https://169.254.169.254/latest",
      "https://localhost/x",
      "https://fcm.googleapis.com:8443/x",
      "https://user:pw@fcm.googleapis.com/x",
      "https://.push.apple.com/x",
      "not a url",
    ])
      expect(pushHostAllowed(bad), bad).toBe(false)
  })

  it("validates keys, upserts by endpoint (moves to a new user), evicts beyond 10, deletes only your own", async () => {
    const maya = await sessionFor(MAYA)
    const k = browserKeys()
    const sub = (endpoint: string, p256dh = k.p256dh, auth = k.authB64) => ({ subscription: { endpoint, expirationTime: null, keys: { p256dh, auth } }, standalone: false })
    await expect(saveSubscription(t.db, maya, sub("https://evil.example/x"))).rejects.toMatchObject({ reason: "args_invalid", detail: { field: "subscription.endpoint" } })
    await expect(saveSubscription(t.db, maya, sub("https://fcm.googleapis.com/a", "short"))).rejects.toMatchObject({ reason: "args_invalid" })
    await expect(saveSubscription(t.db, maya, sub("https://fcm.googleapis.com/a", k.p256dh, "x".repeat(21)))).rejects.toMatchObject({ reason: "args_invalid" })
    const first = await saveSubscription(t.db, maya, sub("https://fcm.googleapis.com/a"))
    expect(first.subscriptionId).toMatch(/^[0-9a-f-]{36}$/)
    // same endpoint, another user (shared device) → moves
    const sam = await sessionFor(SAM, "Sam")
    await saveSubscription(t.db, sam, sub("https://fcm.googleapis.com/a"))
    const rows = await t.db.select().from(pushSubscription)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.userId).toBe(sam.user.id)
    // 12 more for Maya → the oldest 2 are evicted
    for (let i = 0; i < 12; i++) await saveSubscription(t.db, maya, sub(`https://web.push.apple.com/m${i}`))
    const mine = await t.db.select().from(pushSubscription).where(eq(pushSubscription.userId, maya.user.id))
    expect(mine).toHaveLength(10)
    expect(mine.map((r) => r.endpoint)).not.toContain("https://web.push.apple.com/m0")
    // DELETE: someone else's endpoint is untouched (and no error)
    await deleteSubscription(t.db, maya, "https://fcm.googleapis.com/a")
    expect(await t.db.select().from(pushSubscription).where(eq(pushSubscription.userId, sam.user.id))).toHaveLength(1)
    await deleteSubscription(t.db, sam, "https://fcm.googleapis.com/a")
    expect(await t.db.select().from(pushSubscription).where(eq(pushSubscription.userId, sam.user.id))).toHaveLength(0)
  })

  it("demo sessions: refused unless FLAG_DEMO_PUSH and a pool lease; pending devices refused", async () => {
    const k = browserKeys()
    const body = { subscription: { endpoint: "https://fcm.googleapis.com/d", expirationTime: null, keys: { p256dh: k.p256dh, auth: k.authB64 } }, standalone: true }
    const base = await sessionFor("maya-k1.users.potapp.testnet")
    const demo = { ...base, kind: "demo", device: null, demo: null } as unknown as SessionCtx
    await expect(saveSubscription(t.db, demo, body, {})).rejects.toMatchObject({ reason: "demo_forbidden" })
    const pool = { ...demo, demo: { id: "00000000-0000-4000-8000-000000000001", kind: "pool" } } as unknown as SessionCtx
    await expect(saveSubscription(t.db, pool, body, {})).rejects.toMatchObject({ reason: "demo_forbidden", detail: { why: "demo_push_off" } })
    await expect(saveSubscription(t.db, { ...pool, demo: { ...pool.demo!, kind: "shared" } }, body, { FLAG_DEMO_PUSH: "true" })).rejects.toMatchObject({
      reason: "demo_forbidden",
      detail: { why: "shared_pot" },
    })
    const pending = await sessionFor("u-pend.users.potapp.testnet", "Pat", "dev", "pending")
    await expect(saveSubscription(t.db, pending, body)).rejects.toMatchObject({ reason: "device_not_registered" })
  })
})

describe("fan-out (api-spec §6.1)", () => {
  it("money arrived → every member except the contributor; deduped; members without a subscription are skipped", async () => {
    const maya = await sessionFor(MAYA)
    const sam = await sessionFor(SAM, "Sam")
    await sessionFor(LEO, "Leo") // no subscription
    await subscribe(maya, "https://fcm.googleapis.com/maya")
    await subscribe(sam, "https://web.push.apple.com/sam")
    const sender = new ScriptedSender()
    const ev = { type: "money_arrived" as const, pot: DAO, actor: SAM, amount: "150000000", txHash: "TXa" }
    const r = await notify(deps(sender), ev)
    expect(r).toMatchObject({ eventKey: "contribution:TXa", recipients: 2, sent: 1, skipped: 1 })
    expect(sender.sent.map((x) => x.endpoint)).toEqual(["https://fcm.googleapis.com/maya"])
    const p = JSON.parse(sender.sent[0]!.json)
    expect(p.notification).toMatchObject({ title: "Sam added $150", body: "Added to Lisbon Trip.", navigate: "https://pot.test/p/lisbon-trip" })
    expect(sender.sent[0]!.opts).toMatchObject({ ttl: 21_600, urgency: "low", topic: topic(DAO, "c") })
    // no balances, account ids or tx hashes in the text
    expect(sender.sent[0]!.json).not.toMatch(/450|users\.potapp|TXa/)
    // the same event again → nothing new (notification_log dedupe)
    expect(await notify(deps(sender), ev)).toMatchObject({ recipients: 0 })
    expect(sender.sent).toHaveLength(1)
    const logs = await t.db.select().from(notificationLog)
    expect(logs.map((l) => l.status).sort()).toEqual(["sent", "skipped"])
  })

  it("needs your approval → members who haven't voted minus the requester, high urgency, badge, topic", async () => {
    const maya = await sessionFor(MAYA)
    const sam = await sessionFor(SAM, "Sam")
    const leo = await sessionFor(LEO, "Leo")
    for (const [s, e] of [[maya, "m"], [sam, "s"], [leo, "l"]] as const) await subscribe(s, `https://fcm.googleapis.com/${e}`)
    const sender = new ScriptedSender()
    await notify(deps(sender), { type: "approval_needed", subject: "spend", pot: DAO, proposalId: 3, actor: MAYA, amount: "300000000", category: "tickets" })
    // Sam already voted (get_proposal votes), Maya asked → only Leo
    expect(sender.sent.map((x) => x.endpoint)).toEqual(["https://fcm.googleapis.com/l"])
    const p = JSON.parse(sender.sent[0]!.json)
    expect(p.notification).toMatchObject({ title: "Maya needs your OK", body: "$300 for tickets · Lisbon Trip", navigate: "https://pot.test/p/lisbon-trip?r=3", tag: topic(DAO, 3), app_badge: 1 })
    expect(p.app_badge).toBe(1)
    expect(p.notification.data).toMatchObject({ type: "approval_needed", pot: DAO, proposalId: 3, subject: "spend" })
    // a rules request: same deep link shape, subject "rules" (frontend request 8)
    chain.view(DAO, "get_proposal", () => ({ id: 9, kind: {}, status: "InProgress", votes: {}, submission_time: `${Date.now()}000000` }))
    await notify(deps(sender), { type: "approval_needed", subject: "rules", pot: DAO, proposalId: 9, actor: SAM })
    const rules = sender.sent.slice(1).map((x) => JSON.parse(x.json).notification)
    expect(rules.map((n) => n.title)).toEqual(["Sam asked to change a rule", "Sam asked to change a rule"])
    expect(rules[0]).toMatchObject({ navigate: "https://pot.test/p/lisbon-trip?r=9", data: { proposalId: 9, subject: "rules" } })
    expect(sender.sent[0]!.opts).toMatchObject({ urgency: "high", topic: topic(DAO, 3) })
    expect((sender.sent[0]!.opts as { ttl: number }).ttl).toBeGreaterThan(6 * 86_400)
  })

  it("approved → the requester, with the approvers' names; Pot closed → every payee", async () => {
    const maya = await sessionFor(MAYA)
    const sam = await sessionFor(SAM, "Sam")
    await subscribe(maya, "https://fcm.googleapis.com/m")
    await subscribe(sam, "https://fcm.googleapis.com/s")
    const sender = new ScriptedSender()
    await notify(deps(sender), { type: "request_resolved", pot: DAO, proposalId: 3, requester: MAYA, status: "approved", amount: "300000000", category: "tickets" })
    expect(JSON.parse(sender.sent[0]!.json).notification).toMatchObject({ title: "Approved: $300 is on its way", body: "Sam approved your tickets request." })
    await notify(deps(sender), { type: "pot_closed", pot: DAO, recipients: [MAYA, SAM] })
    const closed = sender.sent.slice(1).map((x) => JSON.parse(x.json).notification)
    expect(closed).toHaveLength(2)
    expect(closed[0]).toMatchObject({ title: "Lisbon Trip is closed", body: "Your share is back in your Pot account." })
    expect(sender.sent.slice(1).map((x) => x.json).join()).not.toMatch(/\$\d/)
  })

  it("410 deletes the subscription; 429 honours Retry-After once; 5xx retries twice; push off without a sender", async () => {
    const maya = await sessionFor(MAYA)
    await subscribe(maya, "https://fcm.googleapis.com/gone")
    await subscribe(maya, "https://web.push.apple.com/busy")
    await subscribe(maya, "https://updates.push.services.mozilla.com/flaky")
    const sender = new ScriptedSender((endpoint, n) =>
      endpoint.endsWith("gone") ? { status: 410 } : endpoint.endsWith("busy") ? (n <= 2 ? { status: 429, retryAfterMs: 1000 } : { status: 201 }) : { status: 503 },
    )
    const r = await notify(deps(sender), { type: "money_arrived", pot: DAO, actor: SAM, amount: "1000000", txHash: "TXb" })
    expect(r).toMatchObject({ recipients: 1, sent: 1, deleted: 1 })
    const per = (suffix: string) => sender.sent.filter((x) => x.endpoint.endsWith(suffix)).length
    expect([per("gone"), per("busy"), per("flaky")]).toEqual([1, 2, 3])
    const left = await t.db.select().from(pushSubscription)
    expect(left.map((x) => x.endpoint).sort()).toEqual(["https://updates.push.services.mozilla.com/flaky", "https://web.push.apple.com/busy"])
    expect(left.find((x) => x.endpoint.endsWith("flaky"))!.failCount).toBe(1)
    expect(await notify(deps(null), { type: "money_arrived", pot: DAO, actor: SAM, amount: "1", txHash: "TXc" })).toMatchObject({ recipients: 0 })
  })
})

describe("hub events → notifications", () => {
  const ev = (event: string, data: Record<string, unknown>): RawEvent => ({ standard: "pot", version: "1.0.0", event, data, executor: HUB, receiptId: "r", blockHash: "b", index: 0 })
  it("maps contribution, vote-path requests, close proposals, closes and syncs; ignores instant spends", () => {
    const out = eventsToNotifications(
      [
        ev("contribution", { pot: DAO, member: SAM, amount: "150000000" }),
        ev("spend_requested", { pot: DAO, proposal_id: 3, requester: MAYA, amount: "300000000", category: "tickets", path: "vote" }),
        ev("spend_requested", { pot: DAO, proposal_id: 4, requester: MAYA, amount: "20000000", category: "food", path: "instant" }),
        ev("close_proposed", { pot: DAO, proposal_id: 5, by: LEO }),
        ev("rules_change_proposed", { pot: DAO, proposal_id: 7, by: SAM }),
        ev("pot_closed", { pot: DAO, proposal_id: 5, payouts: [{ account_id: MAYA, amount: "1" }, { account_id: SAM, amount: "1" }] }),
        ev("proposal_synced", { pot: DAO, proposal_id: 3, subject: "spend", request_id: 1, member: null, hub_status: "approved", dao_status: "Approved" }),
        ev("proposal_synced", { pot: DAO, proposal_id: 6, subject: "join", member: LEO, hub_status: "active", dao_status: "Approved" }),
      ],
      "TXd",
    )
    expect(out.map((o) => o.type)).toEqual(["money_arrived", "approval_needed", "approval_needed", "approval_needed", "pot_closed", "request_resolved"])
    expect(out.slice(1, 4).map((o) => (o as { subject: string }).subject)).toEqual(["spend", "close", "rules"])
    expect(out[3]).toMatchObject({ proposalId: 7, actor: SAM })
    expect(out[4]).toMatchObject({ recipients: [MAYA, SAM] })
  })

  it("notifyFromEvents fills the requester and amount of a synced spend from the hub's request record", async () => {
    const maya = await sessionFor(MAYA)
    await sessionFor(SAM, "Sam")
    await subscribe(maya, "https://fcm.googleapis.com/m")
    chain.view(HUB, "get_requests", () => [{ request_id: 1, proposal_id: 3, requester: MAYA, amount: "300000000", category: "tickets", path: "vote", status: "approved" }])
    const sender = new ScriptedSender()
    await notifyFromEvents(deps(sender), [ev("proposal_synced", { pot: DAO, proposal_id: 3, subject: "spend", request_id: 1, member: null, hub_status: "approved" })], "TXe")
    expect(sender.sent).toHaveLength(1)
    expect(JSON.parse(sender.sent[0]!.json).notification.title).toBe("Approved: $300 is on its way")
  })
})

// ---------------------------------------------------------------------------------------------
// INTEGRATION: the real web-push encryption + VAPID against a local mock push service that decrypts

describe("integration: mocked push service (aes128gcm + VAPID)", () => {
  let server: Server
  let base = ""
  const got: { path: string; headers: IncomingMessage["headers"]; body: Buffer }[] = []
  let mode: (path: string) => { status: number; headers?: Record<string, string> } = () => ({ status: 201 })
  beforeAll(async () => {
    server = createServer((req, res) => {
      const chunks: Buffer[] = []
      req.on("data", (c: Buffer) => chunks.push(c))
      req.on("end", () => {
        got.push({ path: req.url ?? "", headers: req.headers, body: Buffer.concat(chunks) })
        const m = mode(req.url ?? "")
        res.writeHead(m.status, m.headers ?? {})
        res.end()
      })
    })
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(async () => {
    await new Promise((r) => server.close(r))
  })

  it("delivers a decryptable Declarative payload with TTL/Urgency/Topic/VAPID; 410 removes the endpoint", async () => {
    got.length = 0
    const vapid = webpush.generateVAPIDKeys()
    const sender = createWebPushSender({ publicKey: vapid.publicKey, privateKey: vapid.privateKey, subject: "mailto:alerts@pot.test" })
    const maya = await sessionFor(MAYA)
    await sessionFor(SAM, "Sam")
    // stored directly: the allowlist (an https push host) is enforced by POST /api/push/subscription, tested above
    const k = browserKeys()
    await t.db.insert(pushSubscription).values({ userId: maya.user.id, endpoint: `${base}/push/maya`, p256dh: k.p256dh, auth: k.authB64 })
    await t.db.insert(pushSubscription).values({ userId: maya.user.id, endpoint: `${base}/push/old`, p256dh: k.p256dh, auth: k.authB64 })
    mode = (path) => (path.endsWith("/old") ? { status: 410 } : { status: 201 })
    const r = await notify(deps(sender), { type: "money_arrived", pot: DAO, actor: SAM, amount: "150000000", txHash: "TXint" })
    expect(r).toMatchObject({ recipients: 1, sent: 1, deleted: 1 })
    const hit = got.find((g) => g.path === "/push/maya")!
    expect(hit.headers).toMatchObject({ ttl: "21600", urgency: "low", topic: topic(DAO, "c"), "content-encoding": "aes128gcm" })
    expect(hit.headers.authorization).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=/)
    // the subscriber (browser) decrypts with its private key and auth secret
    const ece = createRequire(createRequire(import.meta.url).resolve("web-push"))("http_ece") as {
      decrypt: (buf: Buffer, p: { version: string; privateKey: unknown; authSecret: string }) => Buffer
    }
    const plain = ece.decrypt(hit.body, { version: "aes128gcm", privateKey: k.ecdh, authSecret: k.authB64 }).toString("utf8")
    expect(Buffer.byteLength(plain)).toBeLessThanOrEqual(MAX_PAYLOAD_BYTES)
    const payload = JSON.parse(plain)
    expect(payload).toMatchObject({ web_push: 8030, notification: { title: "Sam added $150", navigate: "https://pot.test/p/lisbon-trip", data: { type: "money_arrived", pot: DAO } } })
    expect((await t.db.select().from(pushSubscription)).map((s) => s.endpoint)).toEqual([`${base}/push/maya`])
    expect((await t.db.select().from(pushSubscription))[0]!.lastOkAt).not.toBeNull()
    // the VAPID header is cached per push-service origin (Apple: ≤ 1 refresh per hour)
    got.length = 0
    await notify(deps(sender), { type: "money_arrived", pot: DAO, actor: SAM, amount: "2000000", txHash: "TXint2" })
    expect(got[0]!.headers.authorization).toBe(hit.headers.authorization)
  })

  it("429 with Retry-After → one retry that succeeds", async () => {
    got.length = 0
    const vapid = webpush.generateVAPIDKeys()
    const sender = createWebPushSender({ publicKey: vapid.publicKey, privateKey: vapid.privateKey, subject: "mailto:alerts@pot.test" })
    const maya = await sessionFor(MAYA)
    await sessionFor(SAM, "Sam")
    const k = browserKeys()
    await t.db.insert(pushSubscription).values({ userId: maya.user.id, endpoint: `${base}/push/rl`, p256dh: k.p256dh, auth: k.authB64 })
    let n = 0
    mode = () => (++n === 1 ? { status: 429, headers: { "retry-after": "1" } } : { status: 201 })
    const r = await notify(deps(sender), { type: "money_arrived", pot: DAO, actor: SAM, amount: "5000000", txHash: "TXrl" })
    expect(r).toMatchObject({ sent: 1 })
    expect(got).toHaveLength(2)
  })
})
