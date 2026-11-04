"use client"
// The browser's mock data source (NEXT_PUBLIC_DATA_SOURCE=mock, the default until F-05 wires testnet views).
// One World per browser profile in localStorage, shared across tabs (storage events), so a persona switch on
// the DemoBanner sees the same Pot. Actions add deterministic latency like hallway round A, and a test hook
// (`localStorage['pot.mock.fail'] = 'add' | 'spend' | 'vote' | 'create' | 'join'`) makes the next one fail.
import { useSyncExternalStore } from "react"
import { ActionError, classOfReason } from "../errors"
import type { AvatarId } from "@/lib/avatars"
import { PERSONAS, type PersonaId } from "./fixtures"
import * as L from "./links"
import type { ExtrasRec, RulesRec, Vote, World, XcAddRecord } from "./types"
import * as W from "./world"
import { refundDue, withShowcase } from "./wave4"
import { sweepExpiredLinks, withLinkShowcase } from "./links"
import * as G from "./gifts"
import * as T_ from "./topups"
import { newGiftRef, type PayInTone } from "@/lib/gifts"
import { withGiftShowcase } from "./gifts"
import { compactAnswers, type SurveyReq, type SurveyWire } from "@/lib/survey"

const WORLD_KEY = "pot.mock.world.v1"
const SESSION_KEY = "pot.mock.session"
const FAIL_KEY = "pot.mock.fail"
/** "showcase" adds the hub 1.1.0 Pots (Ski Chalet, Festival Fund) to a fresh world; "classic" leaves them out */
const SEED_KEY = "pot.mock.seed"

export interface Session {
  persona: PersonaId
  kind: "mock"
}

/** Relay-like latencies (ms). The spend machine adds its own 1.2 s minimum on top. */
export const LATENCY = { relay: 700, setup: 1400, join: 1100, create: 1600, add: 900, profile: 300, comment: 350 } as const

let world: World | null = null
let session: Session | null | undefined
const listeners = new Set<() => void>()

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}
function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* private mode: the world lasts for this page only */
  }
}

/**
 * A fresh world gets the hub 1.1.0 showcase Pots (earned trust, one OK, an all-or-nothing goal) for people looking
 * at the mock build. Automated browsers (navigator.webdriver) keep the classic two-Pot seed the existing suites are
 * written against, unless a spec opts in with `localStorage['pot.mock.seed'] = 'showcase'`.
 */
function wantsShowcase(): boolean {
  let flag: string | null = null
  try {
    flag = localStorage.getItem(SEED_KEY)
  } catch {}
  if (flag === "showcase") return true
  if (flag === "classic") return false
  return typeof navigator !== "undefined" && !navigator.webdriver
}

function freshWorld(now: number): World {
  const w = W.seedWorld(now)
  return wantsShowcase() ? withGiftShowcase(withLinkShowcase(withShowcase(w, now), now), now) : w
}

function ensureWorld(): World {
  if (world) return world
  const stored = read<World>(WORLD_KEY)
  world = stored && stored.v === 1 ? stored : freshWorld(Date.now())
  // pay by link: links past their date go back to their Pot (the mock's stand-in for the daily job)
  const swept = sweepExpiredLinks(world, Date.now())
  if (!stored || swept !== world) write(WORLD_KEY, (world = swept))
  return world
}

// The mock's stand-in for the server cron (hub 1.1.0 refund_unfunded): while anyone is subscribed, a missed
// all-or-nothing goal is refunded in its two steps (propose, then approve REFUND_PHASE_MS later).
let cronTimer: ReturnType<typeof setInterval> | null = null
function mockCron() {
  const next = refundDue(ensureWorld(), Date.now())
  if (next) commit(next)
}

function readSession(): Session | null {
  if (session !== undefined) return session
  const s = read<Session>(SESSION_KEY)
  session = s && PERSONAS.includes(s.persona) ? s : null
  return session
}

function emit() {
  for (const l of listeners) l()
}

function commit(next: World) {
  world = next
  write(WORLD_KEY, next)
  emit()
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  if (!cronTimer && typeof window !== "undefined") {
    cronTimer = setInterval(mockCron, 1_000)
    queueMicrotask(mockCron)
  }
  const onStorage = (e: StorageEvent) => {
    if (e.key === WORLD_KEY) world = null
    if (e.key === SESSION_KEY) session = undefined
    if (e.key === WORLD_KEY || e.key === SESSION_KEY) emit()
  }
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(cb)
    window.removeEventListener("storage", onStorage)
    if (listeners.size === 0 && cronTimer) {
      clearInterval(cronTimer)
      cronTimer = null
    }
  }
}

export function useWorld(): World | null {
  return useSyncExternalStore(subscribe, ensureWorld, () => null)
}

/** undefined while rendering on the server / before hydration; null when signed out. */
export function useSession(): Session | null | undefined {
  return useSyncExternalStore<Session | null | undefined>(subscribe, readSession, () => undefined)
}

export function getSession(): Session | null {
  return readSession()
}

export function setSession(persona: PersonaId | null) {
  session = persona ? { persona, kind: "mock" } : null
  write(SESSION_KEY, session)
  emit()
}

export function resetWorld() {
  commit(freshWorld(Date.now()))
}

// ---------------------------------------------------------------------------------------------------------
// async actions (relay-shaped results)

export class MockRelayError extends ActionError {
  constructor(reason: string, detail?: Record<string, unknown>) {
    super(classOfReason(reason), reason, detail ? { detail } : {})
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function maybeFail(kind: string) {
  let f: string | null = null
  try {
    f = localStorage.getItem(FAIL_KEY)
  } catch {}
  if (f === kind) {
    write(FAIL_KEY, null)
    throw new MockRelayError("service_unavailable")
  }
}

function me(): string {
  const s = readSession()
  if (!s) throw new MockRelayError("not_signed_in")
  return s.persona
}

export async function join(slug: string): Promise<W.JoinResult> {
  await sleep(LATENCY.join)
  maybeFail("join")
  const r = W.joinPot(ensureWorld(), slug, me(), Date.now())
  if (r.result === "joined") commit(r.world)
  return r.result
}

/** You → Profile → Avatar (the mock's PATCH /api/me). */
export async function setAvatar(avatar: AvatarId | null): Promise<void> {
  await sleep(LATENCY.profile)
  maybeFail("avatar")
  commit(W.setAvatar(ensureWorld(), me(), avatar))
}

// "Help us make Pot better" (first-run onboarding): the mock's POST/GET /api/me/survey. One record per person in
// localStorage['pot.mock.survey'] (upsert), like the server's one row per person. Fault hook: pot.mock.fail = "survey".
export const SURVEY_KEY = "pot.mock.survey"

export async function saveSurvey(req: SurveyReq): Promise<SurveyWire> {
  await sleep(LATENCY.profile)
  maybeFail("survey")
  const who = me()
  const all = read<Record<string, SurveyWire>>(SURVEY_KEY) ?? {}
  const now = new Date().toISOString()
  const rec: SurveyWire = { version: req.version, answers: compactAnswers(req.answers), context: req.context ?? null, createdAt: all[who]?.createdAt ?? now, updatedAt: now }
  write(SURVEY_KEY, { ...all, [who]: rec })
  return rec
}

export async function getSurvey(): Promise<SurveyWire | null> {
  const s = readSession()
  if (!s) return null
  return read<Record<string, SurveyWire>>(SURVEY_KEY)?.[s.persona] ?? null
}

export async function addMoney(slug: string, amountCents: number, source: "demo" | "pot_dollars" = "demo", xc?: XcAddRecord): Promise<void> {
  await sleep(LATENCY.add)
  maybeFail("add")
  let next: World
  try {
    next = W.addMoney(ensureWorld(), slug, me(), amountCents, Date.now(), xc ? "xc" : source, xc)
  } catch (e) {
    if (e instanceof Error && e.message === "insufficient_own") throw new MockRelayError("insufficient_balance")
    if (e instanceof W.HubError) throw new ActionError("specific", e.code)
    throw e
  }
  commit(next)
}

export interface SpendResult {
  id: number
  path: "instant" | "vote"
  payout: "sent" | "pending"
  /** hub 1.1.0 */
  tier?: "instant" | "one_ok" | "group"
}

export async function requestSpend(slug: string, input: W.SpendInput): Promise<SpendResult> {
  await sleep(LATENCY.relay)
  maybeFail("spend")
  const r = await hubCall(() => W.requestSpend(ensureWorld(), slug, me(), input, Date.now()))
  commit(r.world)
  return { id: r.request.id, path: r.request.path, payout: r.request.status === "paid" ? "sent" : "pending", ...(r.request.tier ? { tier: r.request.tier } : {}) }
}

/** hub 1.1.0 ok_request (fault hook: 'ok'). */
export async function okRequest(slug: string, id: number): Promise<W.OkRequestResult> {
  await sleep(LATENCY.relay)
  maybeFail("ok")
  const r = await hubCall(() => W.okRequest(ensureWorld(), slug, id, me(), Date.now()))
  if (r.result === "approved" || r.result === "failed") commit(r.world)
  return r.result
}

export async function castVote(slug: string, id: number, v: Vote): Promise<W.VoteResult> {
  await sleep(LATENCY.relay)
  maybeFail("vote")
  const r = W.vote(ensureWorld(), slug, id, me(), v, Date.now())
  if (r.result === "counted" || r.result === "approved" || r.result === "declined") commit(r.world)
  return r.result
}

export async function createPot(input: W.CreateInput): Promise<string> {
  await sleep(LATENCY.create)
  maybeFail("create")
  const suffix = Math.random().toString(36).slice(2, 6).padEnd(4, "0")
  const r = W.createPot(ensureWorld(), me(), input, Date.now(), suffix)
  commit(r.world)
  return r.slug
}

export async function rotateInvite(slug: string, invite: { pk: string; secret: string }): Promise<void> {
  await sleep(LATENCY.relay)
  commit(W.rotateInvite(ensureWorld(), slug, me(), invite, Date.now()))
}

/** Account setup for a new person (F1 step 4). The mock signs the invitee in as Leo. */
export async function createSession(persona: PersonaId): Promise<void> {
  await sleep(LATENCY.setup)
  maybeFail("setup")
  setSession(persona)
}

// ---------------------------------------------------------------------------------------------------------
// close (P-9) and rules changes (P-8). Fault hooks: 'close' (service down), 'close_busy' (ERR_POT_BUSY: money
// moved in the last minute), 'rules' (service down), 'rules_pending' (ERR_RULES_PENDING).

function hubFail(kind: string, code: string) {
  let f: string | null = null
  try {
    f = localStorage.getItem(FAIL_KEY)
  } catch {}
  if (f === kind) {
    write(FAIL_KEY, null)
    throw new ActionError("specific", code)
  }
}

async function hubCall<T>(fn: () => T): Promise<T> {
  try {
    return fn()
  } catch (e) {
    if (e instanceof W.HubError) throw new ActionError("specific", e.code)
    throw e
  }
}

export async function proposeClose(slug: string): Promise<{ proposalId: number; status: "needs" | "approved" }> {
  await sleep(LATENCY.relay)
  maybeFail("close")
  hubFail("close_busy", "ERR_POT_BUSY")
  const r = await hubCall(() => W.proposeClose(ensureWorld(), slug, me(), Date.now()))
  commit(r.world)
  return { proposalId: r.close.id, status: r.close.status === "approved" ? "approved" : "needs" }
}

export async function voteClose(slug: string, v: Vote): Promise<W.VoteResult> {
  await sleep(LATENCY.relay)
  maybeFail("vote")
  const r = await hubCall(() => W.voteClose(ensureWorld(), slug, me(), v, Date.now()))
  if (r.result === "counted" || r.result === "approved" || r.result === "declined") commit(r.world)
  return r.result
}

export async function proposeRules(slug: string, rules: RulesRec, extras?: ExtrasRec): Promise<{ proposalId: number; status: "needs" | "approved" }> {
  await sleep(LATENCY.relay)
  maybeFail("rules")
  hubFail("rules_pending", "ERR_RULES_PENDING")
  const r = await hubCall(() => W.proposeRules(ensureWorld(), slug, me(), rules, Date.now(), extras))
  commit(r.world)
  return { proposalId: r.proposal.id, status: r.proposal.status === "approved" ? "approved" : "needs" }
}

export async function voteRules(slug: string, v: Vote): Promise<W.VoteResult> {
  await sleep(LATENCY.relay)
  maybeFail("vote")
  const r = await hubCall(() => W.voteRules(ensureWorld(), slug, me(), v, Date.now()))
  if (r.result === "counted" || r.result === "approved" || r.result === "declined") commit(r.world)
  return r.result
}

export async function setRules(slug: string, rules: RulesRec, extras?: ExtrasRec): Promise<void> {
  await sleep(LATENCY.relay)
  maybeFail("rules")
  const w = await hubCall(() => W.setRules(ensureWorld(), slug, me(), rules, Date.now(), extras))
  commit(w)
}

// ---------------------------------------------------------------------------------------------------------
// comments on requests (the mock's GET/POST/DELETE …/requests/[id]/comments). Fault hook: 'comment' (the next send
// or delete fails like an unreachable server, so the composer's retry can be tested).

/** Save the receipt details of my own spend (the mock's POST …/receipt; fault hook 'receipt_save'). */
export async function saveReceipt(slug: string, requestId: number, receipt: unknown): Promise<void> {
  await sleep(LATENCY.comment)
  maybeFail("receipt_save")
  let next: World
  try {
    next = W.saveReceipt(ensureWorld(), slug, requestId, me(), receipt, Date.now())
  } catch (e) {
    if (e instanceof W.ReceiptWorldError)
      throw new MockRelayError(
        e.code === "not_member" ? "not_a_member" : e.code === "not_found" ? "not_found" : e.code === "invalid" ? "bad_request" : e.code === "already_saved" ? "idempotency_conflict" : e.code === "not_requester" ? "action_not_allowed" : "payload_mismatch",
      )
    throw e
  }
  if (next !== world) commit(next)
}

function commentCall<T>(fn: () => T): T {
  try {
    return fn()
  } catch (e) {
    if (e instanceof W.CommentWorldError) throw new MockRelayError(e.code === "not_member" ? "not_a_member" : e.code === "invalid" ? "bad_request" : "not_found")
    throw e
  }
}

/** Post a comment; the same key twice returns the first one (like the API's idempotency key). */
export async function postComment(slug: string, requestId: number, body: string, key: string): Promise<string> {
  await sleep(LATENCY.comment)
  maybeFail("comment")
  const id = `m-${key}`
  const w = ensureWorld()
  if ((w.comments ?? []).some((c) => c.id === id)) return id
  commit(commentCall(() => W.addComment(w, slug, requestId, me(), body, Date.now(), id)))
  return id
}

export async function deleteComment(slug: string, requestId: number, id: string): Promise<void> {
  await sleep(LATENCY.comment)
  maybeFail("comment")
  commit(commentCall(() => W.removeComment(ensureWorld(), slug, requestId, id, me(), Date.now())))
}

// ---------------------------------------------------------------------------------------------------------
// pay by link (hub 1.1.0 claim_link / reclaim_link). Fault hooks: 'claim' (the claim's relay is down), 'reclaim'.

/** The claim page's link (no session needed: anyone with the link sees it). */
export function claimLinkView(world: World, slug: string, id: number, now: number) {
  return L.claimView(world, slug, id, now, W.nameOf, (r) => W.requestStatusOf(world.pots[slug]!, r, now))
}

/** claim_link to the signed-in person; `pk` = the public key of the secret this browser holds. */
export async function claimLink(slug: string, id: number, pk: string): Promise<L.ClaimResult> {
  await sleep(LATENCY.relay)
  maybeFail("claim")
  const r = L.claimLink(ensureWorld(), slug, id, me(), pk, Date.now())
  if (r.result === "claimed") commit(r.world)
  return r.result
}

/** reclaim_link: the requester takes the link back (the money goes back into the Pot). */
export async function reclaimLink(slug: string, id: number): Promise<L.ReclaimResult> {
  await sleep(LATENCY.relay)
  maybeFail("reclaim")
  const r = L.reclaimLink(ensureWorld(), slug, id, me(), Date.now())
  if (r.result === "returned") commit(r.world)
  return r.result
}

/** A seeded link's secret (fixtures only): the requester's "device" for the showcase links. */
export function demoLinkSecret(slug: string, id: number): string | null {
  return ensureWorld().pots[slug]?.requests.find((r) => r.id === id)?.link?.demoSecret ?? null
}

// ---------------------------------------------------------------------------------------------------------
// gifts (hub 1.2.0 + our server's gift tables). Fault hooks: 'gift' (the gift's send fails), 'gift_link', 'gifts'.

export const LATENCY_GIFT = { link: 450, give: 900, toggle: 600 } as const

function giftCall<T>(fn: () => T): T {
  try {
    return fn()
  } catch (e) {
    if (e instanceof G.GiftWorldError) {
      const c = e.code
      throw new MockRelayError(
        c === "not_member"
          ? "not_a_member"
          : c === "not_found" || c === "not_giver" || c === "page_off"
            ? "not_found"
            : c === "too_low"
              ? "amount_too_low"
              : c === "too_high"
                ? "amount_too_high"
                : c === "closed"
                  ? "pot_closed"
                  : c === "invalid" || c === "fixed_amount"
                    ? "args_invalid"
                    : "action_not_allowed",
      )
    }
    throw e
  }
}

const randomId = (n: number) => {
  const a = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
  let s = ""
  for (let i = 0; i < n; i++) s += a[Math.floor(Math.random() * a.length)]
  return s
}

/** A member makes a gift link (the mock's POST /api/pots/[pot]/gift-links). */
export async function createGiftLink(slug: string, input: G.GiftLinkInput): Promise<string> {
  await sleep(LATENCY_GIFT.link)
  maybeFail("gift_link")
  const r = giftCall(() => G.createGiftLink(ensureWorld(), slug, me(), input, Date.now(), randomId(22)))
  commit(r.world)
  return r.link.id
}

export async function revokeGiftLink(slug: string, id: string): Promise<void> {
  await sleep(LATENCY_GIFT.link)
  maybeFail("gift_link")
  commit(giftCall(() => G.revokeGiftLink(ensureWorld(), slug, me(), id, Date.now())))
}

/** ••• → Gifts → on/off (the hub's set_gifts). */
export async function setGiftsOn(slug: string, on: boolean): Promise<void> {
  await sleep(LATENCY_GIFT.toggle)
  maybeFail("gifts")
  commit(giftCall(() => G.setGiftsOn(ensureWorld(), slug, me(), on)))
}

/** Settings → Public page: on/off, its one-liner and its tone. */
export async function setGiftPage(slug: string, input: { on: boolean; line?: string | null; tone?: PayInTone }): Promise<void> {
  await sleep(LATENCY_GIFT.toggle)
  maybeFail("gifts")
  commit(giftCall(() => G.setGiftPage(ensureWorld(), slug, me(), input)))
}

/** Send a gift as the signed-in person (demo dollars: claimed and sent in one go, like Add money). */
export async function giveGift(input: Omit<G.GiveInput, "who">): Promise<{ ref: string }> {
  await sleep(LATENCY_GIFT.give)
  maybeFail("gift")
  const ref = newGiftRef()
  // from the giver's own Pot dollars: only what they have (the real token refuses more; nothing moves)
  if (input.source === "pot_dollars" && input.amount > W.ownDollarsOf(ensureWorld(), me())) throw new MockRelayError("insufficient_balance")
  const r = giftCall(() => G.giveGift(ensureWorld(), { ...input, who: me() }, Date.now(), ref))
  commit(r.world)
  return { ref }
}

export async function editGift(ref: string, patch: { name?: string | null; note?: string | null; showPublic?: boolean }): Promise<void> {
  await sleep(LATENCY.comment)
  commit(giftCall(() => G.editGift(ensureWorld(), ref, me(), patch)))
}

// ---------------------------------------------------------------------------------------------------------
// "Ask for a top-up" (the mock's /api/pots/[pot]/topups and /api/nudges). Fault hooks: 'topup' (the ask fails like an
// unreachable server), 'topup_cancel', 'nudge'.

export const LATENCY_TOPUP = { ask: 600, cancel: 400, nudge: 400 } as const

function topupCall<T>(fn: () => T): T {
  try {
    return fn()
  } catch (e) {
    if (e instanceof T_.TopupWorldError) {
      const c = e.code
      throw new MockRelayError(
        c === "not_member"
          ? "not_a_member"
          : c === "not_found"
            ? "not_found"
            : c === "closed"
              ? "pot_closed"
              : c === "too_low"
                ? "amount_too_low"
                : c === "too_high"
                  ? "amount_too_high"
                  : c === "invalid"
                    ? "bad_request"
                    : c === "too_soon"
                      ? "nudge_too_soon"
                      : "action_not_allowed",
        { cause: c === "open" ? "topup_open" : c === "ended" ? "topup_ended" : c === "nothing" ? "nothing_to_nudge" : c },
      )
    }
    throw e
  }
}

/** Ask everyone in the Pot for more money; resolves with the ask's id. */
export async function askTopup(slug: string, input: T_.AskInput): Promise<string> {
  await sleep(LATENCY_TOPUP.ask)
  maybeFail("topup")
  const id = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
  const r = topupCall(() => T_.askTopup(ensureWorld(), slug, me(), input, Date.now(), id, W.nameOf))
  commit(r.world)
  return r.rec.id
}

export async function cancelTopup(slug: string, id: string): Promise<void> {
  await sleep(LATENCY_TOPUP.cancel)
  maybeFail("topup_cancel")
  const next = topupCall(() => T_.cancelTopup(ensureWorld(), slug, me(), id, Date.now()))
  if (next !== world) commit(next)
}

/** Nudge people who haven't added; resolves with who was nudged. */
export async function nudgeTopup(slug: string, id: string, targets: readonly string[]): Promise<string[]> {
  await sleep(LATENCY_TOPUP.nudge)
  maybeFail("nudge")
  const r = topupCall(() => T_.nudgeTopup(ensureWorld(), slug, me(), id, targets, Date.now(), W.nameOf))
  commit(r.world)
  return r.nudged
}
