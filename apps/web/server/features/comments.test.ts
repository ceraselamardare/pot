// Comments on requests (server/features/comments.ts, the routes under app/api/pots/[pot]/requests/[id]/comments)
// against pot_test with a fake chain: members only (hub.get_members, never the client's word), text validation,
// soft delete of the author's own comment only, idempotent retries, the burst quota, the feed's commentCounts, and
// the push fan-out (requester + earlier commenters, never the author; lock-screen safe, never the text).
import { vi } from "vitest"
vi.mock("server-only", () => ({}))
import { eq } from "drizzle-orm"
import { KeyPair } from "near-api-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { pot, requestComment } from "@/db/schema"
import { createTestDb, type TestDb } from "@/db/testing"
import { cleanComment } from "@/lib/comment-text"
import { createHubReader } from "../chain/hub"
import type { Config } from "../config"
import { notifyComment } from "../notify/notify"
import { topic } from "../notify/payload"
import { saveSubscription } from "../notify/subscriptions"
import type { PushResult, PushSender } from "../notify/webpush"
import { createSession, loadSession, type SessionCtx } from "../session/store"
import { DAO, HUB } from "../testing/delegates"
import { insertUser, seedChain, testConfig } from "../testing/env"
import { FakeChain } from "../testing/fakeChain"
import { deleteComment, listComments, postComment, type CommentDeps, type PostedComment } from "./comments"
import { getFeed } from "./feed"

let t: TestDb
let cfg: Config
let chain: FakeChain
const MAYA = "maya.users.potapp.testnet"
const SAM = "sam.users.potapp.testnet"
const LEO = "leo.users.potapp.testnet"
const EVE = "eve.users.potapp.testnet" // not a member
let members: { account_id: string; status: string }[]

beforeAll(async () => {
  t = await createTestDb("comments")
})
afterAll(async () => {
  await t.close()
})
beforeEach(async () => {
  await t.truncate()
  for (const k of Object.keys(process.env)) if (k.startsWith("QUOTA_")) delete process.env[k]
  cfg = testConfig()
  chain = seedChain(new FakeChain())
  members = [MAYA, SAM, LEO].map((a) => ({ account_id: a, status: "active", contributed: "150000000" }))
  chain.view(HUB, "get_members", () => members)
  // request 0: Sam asks for $300 (vote path); request 1 doesn't exist
  chain.view(HUB, "get_requests", (a) =>
    (a.from_index as number) === 0
      ? [{ request_id: 0, pot: DAO, requester: SAM, receiver_id: SAM, amount: "300000000", category: "tickets", request_ref: "k3d9x1a2b4c6m7n8", path: "vote", reason: "over_cap", status: "proposed", proposal_id: 4, created_at_ms: 1, updated_at_ms: 1, expires_at_ms: 2 }]
      : [],
  )
  await t.db.insert(pot).values({ daoId: DAO, slug: "lisbon-trip", hubId: HUB, name: "Lisbon Trip", preset: "trip", creatorAccount: MAYA })
})

async function sessionFor(account: string, name?: string): Promise<SessionCtx> {
  const key = KeyPair.fromRandom("ed25519")
  const { user, device } = await insertUser(t.db, { account, key })
  if (name) await t.db.execute(`UPDATE app_user SET display_name = '${name}' WHERE id = '${user.id}'` as never)
  const s = await createSession(t.db, { userId: user.id, kind: "near-auth", deviceId: device?.id })
  return (await loadSession(t.db, new Request("https://pot.test", { headers: { cookie: `__Host-pot_session=${s.cookieValue}` } }), cfg))!
}

const deps = (onPosted?: (c: PostedComment) => void): CommentDeps => ({ db: t.db, hub: createHubReader(chain, HUB), cfg, onPosted })
const post = (s: SessionCtx, body: string, opts: { id?: string; key?: string; pot?: string; onPosted?: (c: PostedComment) => void } = {}) =>
  postComment(deps(opts.onPosted), s, opts.pot ?? "lisbon-trip", opts.id ?? "0", { body, ...(opts.key ? { idempotencyKey: opts.key } : {}) })
const list = (s: SessionCtx, id = "0") => listComments(deps(), s, "lisbon-trip", id)

describe("members only", () => {
  it("a member posts and every member reads the thread, oldest first, with names", async () => {
    const sam = await sessionFor(SAM, "Sam")
    const maya = await sessionFor(MAYA, "Maya")
    const a = await post(sam, "  Tickets for Friday's show  ")
    expect(a.status).toBe(201)
    expect(a.comment).toMatchObject({ author: SAM, body: "Tickets for Friday's show", deleted: false })
    expect(a.comment.id).toMatch(/^[1-9][0-9]*$/)
    await post(maya, "Nice, the boat one?")
    const r = await list(maya)
    expect(r).toMatchObject({ pot: DAO, hubRequestId: 0 })
    expect(r.comments.map((c) => [c.author, c.body])).toEqual([
      [SAM, "Tickets for Friday's show"],
      [MAYA, "Nice, the boat one?"],
    ])
    expect(r.profiles[SAM]).toEqual({ name: "Sam", avatar: null })
    // the slug and the DAO id address the same thread
    expect((await listComments(deps(), maya, DAO, "0")).comments).toHaveLength(2)
  })

  it("someone outside the Pot can't read, write or delete (not_a_member), whatever the client sends", async () => {
    const sam = await sessionFor(SAM)
    const { comment } = await post(sam, "hello")
    const eve = await sessionFor(EVE)
    await expect(list(eve)).rejects.toMatchObject({ reason: "not_a_member", status: 403 })
    await expect(post(eve, "let me in")).rejects.toMatchObject({ reason: "not_a_member" })
    await expect(deleteComment(deps(), eve, "lisbon-trip", "0", comment.id)).rejects.toMatchObject({ reason: "not_a_member" })
    expect(await t.db.select().from(requestComment)).toHaveLength(1)
  })

  it("a member who is only joining (not active yet) is not a member here", async () => {
    members = [...members, { account_id: EVE, status: "joining" }]
    const eve = await sessionFor(EVE)
    await expect(list(eve)).rejects.toMatchObject({ reason: "not_a_member" })
  })

  it("unknown Pot → pot_unknown; a request id that isn't one → bad_request; a request that doesn't exist → not_found", async () => {
    const sam = await sessionFor(SAM)
    await expect(listComments(deps(), sam, "nope-pot", "0")).rejects.toMatchObject({ reason: "pot_unknown" })
    for (const id of ["-1", "01", "x", "1.5", "9999999999", ""]) await expect(list(sam, id)).rejects.toMatchObject({ reason: "bad_request", detail: { field: "id" } })
    await expect(post(sam, "hi", { id: "1" })).rejects.toMatchObject({ reason: "not_found" })
  })
})

describe("text", () => {
  it.each([
    ["", "length"],
    ["   \n\t  ", "length"],
    ["x".repeat(281), "length"],
    ["bell\u0007", "control"],
    ["rtl ‮ override", "format"],
    ["line sep", "control"],
  ])("refuses %j (%s) → 400 bad_request field body, nothing stored", async (body, why) => {
    const sam = await sessionFor(SAM)
    await expect(post(sam, body)).rejects.toMatchObject({ reason: "bad_request", detail: { field: "body", why } })
    expect(await t.db.select().from(requestComment)).toHaveLength(0)
  })

  it("normalizes: NFC, trims, CRLF → LF, at most one blank line, 280 code points (emoji count once)", async () => {
    expect(cleanComment("Café \r\n\r\n\r\n\r\nok  ")).toEqual({ ok: true, value: "Café\n\nok" })
    expect(cleanComment("👍".repeat(280))).toMatchObject({ ok: true })
    expect(cleanComment("👨‍👩‍👧 ❤️")).toMatchObject({ ok: true }) // ZWJ and VS16 are fine
    const sam = await sessionFor(SAM)
    const { comment } = await post(sam, "a\r\nb")
    expect(comment.body).toBe("a\nb")
  })

  it("HTML is stored and returned as plain text (React escapes it on render)", async () => {
    const sam = await sessionFor(SAM)
    const { comment } = await post(sam, "<img src=x onerror=alert(1)> <b>bold</b>")
    expect(comment.body).toBe("<img src=x onerror=alert(1)> <b>bold</b>")
  })
})

describe("delete: the author's own only, soft", () => {
  it("the author removes it: 'Comment removed' keeps its place, the text is wiped, idempotent", async () => {
    const sam = await sessionFor(SAM)
    const maya = await sessionFor(MAYA)
    const a = await post(sam, "first")
    await post(maya, "second")
    const d = await deleteComment(deps(), sam, "lisbon-trip", "0", a.comment.id)
    expect(d.comment).toMatchObject({ id: a.comment.id, deleted: true, body: null })
    const row = (await t.db.select().from(requestComment).where(eq(requestComment.id, Number(a.comment.id))))[0]!
    expect(row.body).toBe("")
    expect(row.deletedAt).not.toBeNull()
    expect((await list(maya)).comments.map((c) => [c.deleted, c.body])).toEqual([
      [true, null],
      [false, "second"],
    ])
    expect((await deleteComment(deps(), sam, "lisbon-trip", "0", a.comment.id)).comment.deleted).toBe(true)
  })

  it("another member can't remove it (404 like a missing one) and it stays", async () => {
    const sam = await sessionFor(SAM)
    const maya = await sessionFor(MAYA)
    const a = await post(sam, "mine")
    await expect(deleteComment(deps(), maya, "lisbon-trip", "0", a.comment.id)).rejects.toMatchObject({ reason: "not_found", status: 404 })
    // the right id under another request is not found either
    await expect(deleteComment(deps(), sam, "lisbon-trip", "1", a.comment.id)).rejects.toMatchObject({ reason: "not_found" })
    await expect(deleteComment(deps(), sam, "lisbon-trip", "0", "abc")).rejects.toMatchObject({ reason: "not_found" })
    expect((await list(sam)).comments[0]).toMatchObject({ body: "mine", deleted: false })
  })

  it("the DB refuses a removed comment that keeps its text, or an empty live one (request_comment_body_ck)", async () => {
    const sam = await sessionFor(SAM)
    const a = await post(sam, "keep")
    const err = await t.db
      .update(requestComment)
      .set({ deletedAt: new Date() })
      .where(eq(requestComment.id, Number(a.comment.id)))
      .then(() => null, (e: { cause?: { constraint?: string } }) => e)
    expect(err?.cause?.constraint).toBe("request_comment_body_ck")
  })
})

describe("retries and limits", () => {
  it("the same idempotency key returns the first comment (a retried send never posts twice)", async () => {
    const sam = await sessionFor(SAM)
    const a = await post(sam, "once", { key: "aaaaaaaaaaaaaaaa" })
    const b = await post(sam, "once", { key: "aaaaaaaaaaaaaaaa" })
    expect(b).toMatchObject({ replayed: true, status: 200, comment: { id: a.comment.id } })
    await expect(post(sam, "something else", { key: "aaaaaaaaaaaaaaaa" })).rejects.toMatchObject({ reason: "idempotency_conflict" })
    expect(await t.db.select().from(requestComment)).toHaveLength(1)
  })

  it("burst: more than the per-minute limit → 429 rate_limited with retryAfterMs", async () => {
    process.env.QUOTA_USER_COMMENT_BURST = "2"
    const sam = await sessionFor(SAM)
    await post(sam, "one")
    await post(sam, "two")
    await expect(post(sam, "three")).rejects.toMatchObject({ reason: "rate_limited", status: 429 })
    expect(await t.db.select().from(requestComment)).toHaveLength(2)
  })

  it("daily cap → quota_exceeded family comments", async () => {
    process.env.QUOTA_USER_COMMENTS = "1"
    const sam = await sessionFor(SAM)
    await post(sam, "one")
    await expect(post(sam, "two")).rejects.toMatchObject({ reason: "quota_exceeded", detail: { family: "comments" } })
  })
})

describe("feed and notifications", () => {
  it("the feed gives members commentCounts (removed ones not counted); others get none", async () => {
    const sam = await sessionFor(SAM)
    const maya = await sessionFor(MAYA)
    await post(sam, "a")
    const b = await post(maya, "b")
    await post(maya, "c")
    await deleteComment(deps(), maya, "lisbon-trip", "0", b.comment.id)
    const feed = await getFeed({ db: t.db, hub: createHubReader(chain, HUB), cfg }, maya, "lisbon-trip", {})
    expect(feed.body.commentCounts).toEqual({ "0": 2 })
    const anon = await getFeed({ db: t.db, hub: createHubReader(chain, HUB), cfg }, null, "lisbon-trip", {})
    expect(anon.body.commentCounts).toBeUndefined()
  })

  it("onPosted names the requester and earlier commenters, never the author", async () => {
    const sam = await sessionFor(SAM)
    const maya = await sessionFor(MAYA)
    const leo = await sessionFor(LEO)
    const seen: PostedComment[] = []
    await post(maya, "q?", { onPosted: (c) => seen.push(c) })
    await post(leo, "same", { onPosted: (c) => seen.push(c) })
    await post(sam, "answer", { onPosted: (c) => seen.push(c) })
    expect(seen.map((c) => [c.actor, c.requester, [...c.earlier].sort()])).toEqual([
      [MAYA, SAM, []],
      [LEO, SAM, [MAYA]],
      [SAM, SAM, [LEO, MAYA]],
    ])
    expect(seen[0]).toMatchObject({ pot: DAO, requestId: 0, amount: "300000000", category: "tickets" })
  })

  it("push: the requester gets 'commented on your request', earlier commenters 'also commented'; no text, no author", async () => {
    const sam = await sessionFor(SAM, "Sam")
    const maya = await sessionFor(MAYA, "Maya")
    const leo = await sessionFor(LEO, "Leo")
    for (const [s, e] of [[sam, "sam"], [maya, "maya"], [leo, "leo"]] as const)
      await saveSubscription(t.db, s, { subscription: { endpoint: `https://fcm.googleapis.com/${e}`, expirationTime: null, keys: { p256dh: "B".repeat(87), auth: "A".repeat(22) } }, standalone: true, platform: "ios" })
    const sent: { endpoint: string; json: string; opts: unknown }[] = []
    const sender: PushSender = { send: async (target, json, opts) => (sent.push({ endpoint: target.endpoint, json, opts }), { status: 201 } as PushResult) }
    const nd = { db: t.db, hub: createHubReader(chain, HUB), cfg, sender, sleep: async () => undefined }
    // Maya commented before; now Leo comments a secret
    await notifyComment(nd, { pot: DAO, requestId: 0, commentId: "7", actor: LEO, requester: SAM, amount: "300000000", category: "tickets", earlier: [MAYA] })
    const by = Object.fromEntries(sent.map((x) => [x.endpoint.split("/").pop(), JSON.parse(x.json).notification]))
    expect(Object.keys(by).sort()).toEqual(["maya", "sam"])
    expect(by.sam).toMatchObject({ title: "Leo commented on your request", body: "$300 for tickets · Lisbon Trip", navigate: "https://pot.test/p/lisbon-trip?r=0" })
    expect(by.sam.data).toMatchObject({ type: "comment", pot: DAO, requestId: 0, subject: "comment" })
    expect(by.sam.data.proposalId).toBeUndefined() // the SW keeps ?r= as the request id
    expect(by.maya).toMatchObject({ title: "Leo also commented on Sam's request" })
    expect(sent[0]!.opts).toMatchObject({ urgency: "normal", topic: topic(DAO, "comment:0") })
    // a member who left gets nothing; the same comment never notifies twice
    members = members.filter((m) => m.account_id !== MAYA)
    sent.length = 0
    await notifyComment(nd, { pot: DAO, requestId: 0, commentId: "8", actor: LEO, requester: SAM, earlier: [MAYA] })
    expect(sent.map((x) => x.endpoint)).toEqual(["https://fcm.googleapis.com/sam"])
    sent.length = 0
    await notifyComment(nd, { pot: DAO, requestId: 0, commentId: "8", actor: LEO, requester: SAM, earlier: [MAYA] })
    expect(sent).toHaveLength(0)
    // the requester commenting on their own request pushes only the others
    await notifyComment(nd, { pot: DAO, requestId: 0, commentId: "9", actor: SAM, requester: SAM, earlier: [LEO] })
    expect(sent.map((x) => x.endpoint)).toEqual(["https://fcm.googleapis.com/leo"])
  })
})

describe("routes (gates before any read)", () => {
  const ORIGIN = "https://pot.test"
  const req = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
    new Request(`${ORIGIN}${path}`, {
      method,
      headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  const params = <P,>(p: P) => ({ params: Promise.resolve(p) })

  it("GET needs a session; POST/DELETE need same-origin JSON and a strict body", async () => {
    const { setDbForTests } = await import("@/db/client")
    setDbForTests(t.db)
    try {
      const { GET, POST } = await import("@/app/api/pots/[pot]/requests/[id]/comments/route")
      const { DELETE } = await import("@/app/api/pots/[pot]/requests/[id]/comments/[commentId]/route")
      const p = params({ pot: "lisbon-trip", id: "0" })
      expect(await (await GET(req("GET", "/api/pots/lisbon-trip/requests/0/comments"), p)).json()).toMatchObject({ reason: "not_signed_in" })
      expect(await (await POST(req("POST", "/x", { body: "hi" }, { origin: "https://evil.example" }), p)).json()).toMatchObject({ reason: "forbidden_origin" })
      expect((await POST(req("POST", "/x", { body: "hi", extra: 1 }), p)).status).toBe(400)
      expect(await (await POST(req("POST", "/x", { body: "hi" }), p)).json()).toMatchObject({ reason: "not_signed_in" })
      expect(await (await DELETE(req("DELETE", "/x", {}, { "content-type": "text/plain" }), params({ pot: "lisbon-trip", id: "0", commentId: "1" }))).json()).toMatchObject({ reason: "forbidden_origin" })
    } finally {
      setDbForTests(undefined)
    }
  })
})
