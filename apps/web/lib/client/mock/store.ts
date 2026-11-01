"use client"
// The browser's mock data source (NEXT_PUBLIC_DATA_SOURCE=mock, the default until F-05 wires testnet views).
// One World per browser profile in localStorage, shared across tabs (storage events), so a persona switch on
// the DemoBanner sees the same Pot. Actions add deterministic latency like hallway round A, and a test hook
// (`localStorage['pot.mock.fail'] = 'add' | 'spend' | 'vote' | 'create' | 'join'`) makes the next one fail.
import { useSyncExternalStore } from "react"
import { ActionError, classOfReason } from "../errors"
import type { AvatarId } from "@/lib/avatars"
import type { PersonaId } from "./fixtures"
import type { RulesRec, Vote, World } from "./types"
import * as W from "./world"

const WORLD_KEY = "pot.mock.world.v1"
const SESSION_KEY = "pot.mock.session"
const FAIL_KEY = "pot.mock.fail"

export interface Session {
  persona: PersonaId
  kind: "mock"
}

/** Relay-like latencies (ms). The spend machine adds its own 1.2 s minimum on top. */
export const LATENCY = { relay: 700, setup: 1400, join: 1100, create: 1600, add: 900, profile: 300 } as const

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

function ensureWorld(): World {
  if (world) return world
  const stored = read<World>(WORLD_KEY)
  world = stored && stored.v === 1 ? stored : W.seedWorld(Date.now())
  if (!stored) write(WORLD_KEY, world)
  return world
}

function readSession(): Session | null {
  if (session !== undefined) return session
  const s = read<Session>(SESSION_KEY)
  session = s && ["maya", "sam", "leo"].includes(s.persona) ? s : null
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
  const onStorage = (e: StorageEvent) => {
    if (e.key === WORLD_KEY) world = null
    if (e.key === SESSION_KEY) session = undefined
    if (e.key === WORLD_KEY || e.key === SESSION_KEY) emit()
  }
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(cb)
    window.removeEventListener("storage", onStorage)
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
  commit(W.seedWorld(Date.now()))
}

// ---------------------------------------------------------------------------------------------------------
// async actions (relay-shaped results)

export class MockRelayError extends ActionError {
  constructor(reason: string) {
    super(classOfReason(reason), reason)
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

export async function addMoney(slug: string, amountCents: number, source: "demo" | "pot_dollars" = "demo"): Promise<void> {
  await sleep(LATENCY.add)
  maybeFail("add")
  let next: World
  try {
    next = W.addMoney(ensureWorld(), slug, me(), amountCents, Date.now(), source)
  } catch (e) {
    if (e instanceof Error && e.message === "insufficient_own") throw new MockRelayError("insufficient_balance")
    throw e
  }
  commit(next)
}

export interface SpendResult {
  id: number
  path: "instant" | "vote"
  payout: "sent" | "pending"
}

export async function requestSpend(slug: string, input: W.SpendInput): Promise<SpendResult> {
  await sleep(LATENCY.relay)
  maybeFail("spend")
  const r = W.requestSpend(ensureWorld(), slug, me(), input, Date.now())
  commit(r.world)
  return { id: r.request.id, path: r.request.path, payout: r.request.status === "paid" ? "sent" : "pending" }
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

export async function proposeRules(slug: string, rules: RulesRec): Promise<{ proposalId: number; status: "needs" | "approved" }> {
  await sleep(LATENCY.relay)
  maybeFail("rules")
  hubFail("rules_pending", "ERR_RULES_PENDING")
  const r = await hubCall(() => W.proposeRules(ensureWorld(), slug, me(), rules, Date.now()))
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

export async function setRules(slug: string, rules: RulesRec): Promise<void> {
  await sleep(LATENCY.relay)
  maybeFail("rules")
  const w = await hubCall(() => W.setRules(ensureWorld(), slug, me(), rules, Date.now()))
  commit(w)
}
