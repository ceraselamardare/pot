// The static relayer policy (api-spec §3.1, R1-R12; D-24; review-security S-2). Pure: no I/O.
// Check order (§3.2 step 6): action types and count, receiver, method, exact deposit, gas range, args;
// then `intent` must match the decoded call. Anything not matched → receiver_not_allowed.
import { RELAY_POLICY, RESERVED_SLUGS as SDK_RESERVED_SLUGS } from "@pot/sdk"
import type { TestRule } from "../config"
import { ApiError } from "../http/errors"
import { parseEd25519PublicKey } from "../util/crypto"
import { daoSlug, isAccountId, OPKEY_RE, SLUG_RE } from "../util/ids"
import type { DecodedAction, DecodedDelegate } from "./decode"
import { CATEGORIES, type Family, type IntentType } from "./types"

export const TGAS = 1_000_000_000_000n
const NEAR = 10n ** 24n
/** NEAR as a decimal string → yocto (estimates only). */
const near = (s: string) => {
  const [w = "0", f = ""] = s.split(".")
  return BigInt(w) * NEAR + BigInt((f + "0".repeat(24)).slice(0, 24))
}

export const MAX_CONTRIBUTION = 10_000_000_000n // $10,000 at 6 dp
export const MAX_SPEND = 10_000_000_000n
export const MAX_INSTANT_CAP = 1_000_000_000n
export const MAX_MEMBER_BUDGET = 100_000_000_000n
export const MAX_ALLOWLIST = 10
export const MAX_ARGS_BYTES = 2048
export const INVITE_MAX_TTL_MS = 30 * 24 * 3600 * 1000
export const INVITE_MAX_USES = 40
/** hub 1.1.0 pay by link: (now + 60 s, now + 30 days] (WAVE4_LIMITS) */
export const LINK_MAX_TTL_MS = 30 * 24 * 3600 * 1000
export const LINK_MIN_TTL_MS = 60_000
/** R3 keeps the 1.0.0 gas cap for plain requests; only link requests may use up to 300 Tgas. */
export const PLAIN_SPEND_MAX_TGAS = 150
/** what the hub spends registering a link claimer on the token (+ state), for the hub budget quota */
const CLAIM_HUB_YOCTO = 2_500_000_000_000_000_000_000n

/** contracts-spec §3.2 (D-02): exact-match reserved slugs (@pot/sdk mirrors the hub's list). */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set(SDK_RESERVED_SLUGS as readonly string[])

export type RuleId = "R1" | "R2" | "R3" | "R4" | "R5" | "R6" | "R7" | "R8" | "R9" | "R11" | "R13" | "R14" | "R15" | "TEST"
export type VoteAction = "VoteApprove" | "VoteReject" | "Finalize"
export type KindName = "Transfer" | "AddMemberToRole" | "FunctionCall"

export interface PolicyContext {
  hubId: string
  usdcId: string
  intent?: string
  requestRef?: string
  nowMs: number
  testAllowlist?: TestRule[]
}

export interface PolicyMatch {
  rule: RuleId
  methods: string[]
  intent: IntentType | "test"
  family: Family
  potId: string | null
  /** R1, R3, R4, add_invite, R6, R7, R8 need an Open Pot; R5 revoke, R9, R11 only a known one */
  needsOpenPot: boolean
  estYocto: bigint
  hubYocto: bigint
  vote?: { daoId: string; proposalId: number; action: VoteAction; kind: Record<string, unknown>; kindName: KindName }
  retry?: { proposalId: number }
  sync?: { proposalId: number }
  create?: { slug: string }
  spend?: { requestRef: string; amount: bigint; receiverId: string; link?: boolean }
  amount?: bigint
  /** R13-R15 (hub 1.1.0): the request the call acts on */
  requestId?: number
}

// ---------------------------------------------------------------------------------------------
// helpers

const deny = (reason: "args_invalid", field: string, why?: string): never => {
  throw new ApiError(reason, { detail: why ? { field, why } : { field } })
}

type Obj = Record<string, unknown>

function argsObject(a: Extract<DecodedAction, { kind: "functionCall" }>): Obj {
  if (a.argsBytes.length > MAX_ARGS_BYTES) deny("args_invalid", "args", "too_large")
  if (typeof a.args !== "object" || a.args === null || Array.isArray(a.args)) deny("args_invalid", "args", "not_json_object")
  return a.args as Obj
}

/** Exactly these keys: required ones present, nothing unknown. */
function keys(o: Obj, required: string[], optional: string[] = []): void {
  for (const k of required) if (!(k in o)) deny("args_invalid", k, "missing")
  for (const k of Object.keys(o)) if (!required.includes(k) && !optional.includes(k)) deny("args_invalid", k, "unknown")
}

const UINT_RE = /^(0|[1-9][0-9]*)$/
function amount(o: Obj, field: string, min: bigint, max: bigint): bigint {
  const v = o[field]
  if (typeof v !== "string" || !UINT_RE.test(v) || v.length > 40) return deny("args_invalid", field)
  const n = BigInt(v)
  if (n < min || n > max) deny("args_invalid", field, "range")
  return n
}

function potArg(o: Obj, hubId: string, field = "pot"): string {
  const v = o[field]
  if (typeof v !== "string" || !daoSlug(v, hubId)) return deny("args_invalid", field)
  return v
}

function u64(o: Obj, field: string): number {
  const v = o[field]
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0) return deny("args_invalid", field)
  return v
}

function hasFormatOrControl(s: string): boolean {
  for (const ch of s) {
    if (/\p{Cc}/u.test(ch)) return true
    if (/\p{Cf}/u.test(ch) && ch !== "‍" && ch !== "️") return true
  }
  return false
}

/**
 * Rules bounds (R2, R6, R7; contracts-spec §3.8). Returns nothing or throws args_invalid. With `ids`, it also
 * refuses what the hub's validate_rules refuses on chain (ERR_RULES_INVALID): the hub, any Pot of this hub and
 * the token in the named-people list, so a Create form mistake never costs a sponsored transaction.
 */
export function checkRules(r: unknown, field = "rules", ids?: { hubId: string; usdcId: string }): void {
  if (typeof r !== "object" || r === null || Array.isArray(r)) return deny("args_invalid", field)
  const o = r as Obj
  keys(o, ["instant_cap", "member_budget", "instant_payees", "payee_allowlist"])
  amount(o, "instant_cap", 0n, MAX_INSTANT_CAP)
  amount(o, "member_budget", 0n, MAX_MEMBER_BUDGET)
  if (o.instant_payees !== "members" && o.instant_payees !== "members_and_allowlist")
    deny("args_invalid", `${field}.instant_payees`)
  const list = o.payee_allowlist
  if (!Array.isArray(list) || list.length > MAX_ALLOWLIST || !list.every(isAccountId))
    deny("args_invalid", `${field}.payee_allowlist`)
  if (new Set(list as string[]).size !== (list as string[]).length) deny("args_invalid", `${field}.payee_allowlist`, "dup")
  if (o.instant_payees === "members" && (list as string[]).length > 0)
    deny("args_invalid", `${field}.payee_allowlist`, "members_only")
  if (ids && (list as string[]).some((a) => a === ids.hubId || a.endsWith(`.${ids.hubId}`) || a === ids.usdcId))
    deny("args_invalid", `${field}.payee_allowlist`, "reserved")
  if (Buffer.byteLength(JSON.stringify(r)) > 1024) deny("args_invalid", field, "too_large")
}

/**
 * hub 1.1.0 rule extras (R2, R6, R7 `extras`): exact keys, one-OK ceiling ≤ the instant-cap bound of R2,
 * goal amount ≤ $10M-ish bound and a deadline in (now, now + 366 days]. The hub re-validates everything
 * (ERR_EXTRAS_INVALID / ERR_GOAL_*); this only keeps garbage off the relayer's bill.
 */
export function checkExtras(x: unknown, nowMs: number, field = "extras"): void {
  if (typeof x !== "object" || x === null || Array.isArray(x)) return deny("args_invalid", field)
  const o = x as Obj
  keys(o, ["trust", "one_ok_cap", "links"], ["goal"])
  if (typeof o.trust !== "boolean") deny("args_invalid", `${field}.trust`)
  if (typeof o.links !== "boolean") deny("args_invalid", `${field}.links`)
  amount(o, "one_ok_cap", 0n, MAX_SPEND)
  const g = o.goal
  if (g !== undefined && g !== null) {
    if (typeof g !== "object" || Array.isArray(g)) return deny("args_invalid", `${field}.goal`)
    const go = g as Obj
    keys(go, ["amount", "deadline_ms", "all_or_nothing"])
    amount(go, "amount", 1n, MAX_GOAL)
    const d = go.deadline_ms
    if (typeof d !== "number" || !Number.isSafeInteger(d) || d <= nowMs || d > nowMs + 366 * 24 * 3600 * 1000)
      deny("args_invalid", `${field}.goal.deadline_ms`)
    if (typeof go.all_or_nothing !== "boolean") deny("args_invalid", `${field}.goal.all_or_nothing`)
  }
}
export const MAX_GOAL = 10_000_000_000_000n // $10M at 6 dp

/** The @pot/sdk RELAY_POLICY row for a method (R1-R9 gas range and exact deposit). */
function policyRow(method: string) {
  const row = RELAY_POLICY[method]
  if (!row) throw new ApiError("method_not_allowed", { detail: { method } })
  return row
}
function gasFor(a: { gas: bigint; method: string }): void {
  const r = policyRow(a.method)
  gasRange(a, r.gasMinTgas, r.gasMaxTgas)
}
function depositFor(a: { deposit: bigint; method: string }): void {
  depositExactly(a, policyRow(a.method).deposit)
}

function gasRange(a: { gas: bigint }, minTgas: number, maxTgas: number): void {
  if (a.gas < BigInt(minTgas) * TGAS || a.gas > BigInt(maxTgas) * TGAS)
    throw new ApiError("gas_cap", { detail: { min: minTgas * 1e12, max: maxTgas * 1e12, gas: a.gas.toString() } })
}

function depositExactly(a: { deposit: bigint }, want: bigint): void {
  if (a.deposit !== want) throw new ApiError("deposit_cap", { detail: { allowed: want.toString(), got: a.deposit.toString() } })
}

const HUB_METHODS = new Set([
  "create_pot",
  "request_spend",
  "join",
  "add_invite",
  "revoke_invite",
  "set_rules",
  "propose_rules",
  "propose_close",
  "retry_payout",
  "sync",
  // hub 1.1.0 (wave 4); refund_unfunded is cron-only (relayer-signed), never relayed for users
  "ok_request",
  "claim_link",
  "reclaim_link",
])

function intentMust(ctx: PolicyContext, want: IntentType, alsoOk: IntentType[] = []): void {
  if (ctx.intent !== undefined && ctx.intent !== want && !alsoOk.includes(ctx.intent as IntentType))
    deny("args_invalid", "intent", `expected ${want}`)
}

// ---------------------------------------------------------------------------------------------

export function evaluatePolicy(d: DecodedDelegate, ctx: PolicyContext): PolicyMatch {
  const { hubId, usdcId } = ctx
  // 1. action types and count
  if (d.actions.length === 0) throw new ApiError("action_not_allowed", { detail: { why: "no_actions" } })
  if (d.actions.some((a) => a.kind !== "functionCall"))
    throw new ApiError("action_not_allowed", {
      detail: { why: "non_function_call", kinds: d.actions.map((a) => (a.kind === "other" ? a.name : a.kind)) },
    })
  const calls = d.actions as Extract<DecodedAction, { kind: "functionCall" }>[]
  const isRotatePair =
    calls.length === 2 && calls[0]!.method === "revoke_invite" && calls[1]!.method === "add_invite" && d.receiverId === hubId
  if (calls.length > 1 && !isRotatePair) throw new ApiError("action_not_allowed", { detail: { why: "count", n: calls.length } })
  const call = calls[0]!

  // test-only rules (empty on production and mainnet) match on receiver AND method, before the table
  if (calls.length === 1 && ctx.testAllowlist?.some((t) => t.receiver === d.receiverId && t.method === call.method))
    return testRule(call, d.receiverId, ctx)
  // 2. receiver → rule
  if (usdcId && d.receiverId === usdcId) return r1(call, ctx)
  if (hubId && d.receiverId === hubId) {
    if (isRotatePair) return r5pair(calls, ctx)
    if (!HUB_METHODS.has(call.method)) throw new ApiError("method_not_allowed", { detail: { method: call.method } })
    depositFor(call) // rev4: never relay a deposit to the hub (RELAY_POLICY deposit 0)
    switch (call.method) {
      case "create_pot":
        return r2(call, ctx)
      case "request_spend":
        return r3(call, ctx)
      case "join":
        return r4(call, ctx)
      case "add_invite":
      case "revoke_invite":
        return r5single(call, ctx)
      case "set_rules":
      case "propose_rules":
        return r6r7(call, ctx)
      case "propose_close":
        return r8(call, ctx)
      case "ok_request":
        return r13(call, ctx)
      case "claim_link":
        return r14(call, ctx)
      case "reclaim_link":
        return r15(call, ctx)
      default:
        return r9(call, ctx)
    }
  }
  if (hubId && daoSlug(d.receiverId, hubId)) return r11(call, d.receiverId, ctx)
  const test = ctx.testAllowlist?.find((t) => t.receiver === d.receiverId)
  if (test) return testRule(call, d.receiverId, ctx)
  throw new ApiError("receiver_not_allowed", { detail: { receiver: d.receiverId } })
}

// R1 usdc.ft_transfer_call → hub, exactly 1 yocto, 100-150 Tgas
function r1(call: Extract<DecodedAction, { kind: "functionCall" }>, ctx: PolicyContext): PolicyMatch {
  if (call.method !== "ft_transfer_call") throw new ApiError("method_not_allowed", { detail: { method: call.method } })
  depositFor(call)
  gasFor(call)
  const o = argsObject(call)
  keys(o, ["receiver_id", "amount", "msg"])
  if (o.receiver_id !== ctx.hubId) deny("args_invalid", "receiver_id")
  const amt = amount(o, "amount", 1n, MAX_CONTRIBUTION)
  if (typeof o.msg !== "string") return deny("args_invalid", "msg")
  let msg: unknown
  try {
    msg = JSON.parse(o.msg)
  } catch {
    deny("args_invalid", "msg")
  }
  if (typeof msg !== "object" || msg === null || Array.isArray(msg)) return deny("args_invalid", "msg")
  const m = msg as Obj
  if (Object.keys(m).length !== 1 || typeof m.pot !== "string" || !daoSlug(m.pot, ctx.hubId)) deny("args_invalid", "msg")
  intentMust(ctx, "add_money")
  return {
    rule: "R1",
    methods: ["ft_transfer_call"],
    intent: "add_money",
    family: "contribute",
    potId: m.pot as string,
    needsOpenPot: true,
    estYocto: near("0.0012"),
    hubYocto: 0n,
    amount: amt,
  }
}

// R2 create_pot, 0 deposit, 150-300 Tgas
function r2(call: Extract<DecodedAction, { kind: "functionCall" }>, ctx: PolicyContext): PolicyMatch {
  gasFor(call)
  const o = argsObject(call)
  keys(o, ["slug", "name", "preset"], ["rules", "invite_pk", "emoji", "float", "extras"])
  const slug = o.slug
  if (typeof slug !== "string" || slug.length < 2 || slug.length > 32 || !SLUG_RE.test(slug)) return deny("args_invalid", "slug")
  if (RESERVED_SLUGS.has(slug)) deny("args_invalid", "slug", "reserved")
  if (`${slug}.${ctx.hubId}`.length > 64) deny("args_invalid", "slug", "too_long")
  const name = o.name
  if (typeof name !== "string") return deny("args_invalid", "name")
  const n = [...name.trim()].length
  if (n < 2 || n > 40 || hasFormatOrControl(name)) deny("args_invalid", "name")
  if (!["trip", "club", "team", "custom"].includes(o.preset as string)) deny("args_invalid", "preset")
  if (o.rules === undefined || o.rules === null) {
    if (o.preset === "custom") deny("args_invalid", "rules", "custom_needs_rules")
  } else checkRules(o.rules, "rules", ctx)
  if (o.invite_pk !== undefined && o.invite_pk !== null) {
    if (typeof o.invite_pk !== "string" || !parseEd25519PublicKey(o.invite_pk)) deny("args_invalid", "invite_pk")
  }
  if (o.emoji !== undefined && o.emoji !== null) {
    const e = o.emoji
    if (typeof e !== "string") return deny("args_invalid", "emoji")
    const bytes = Buffer.byteLength(e)
    if (bytes < 1 || bytes > 16 || /[A-Za-z0-9]/.test(e) || hasFormatOrControl(e)) deny("args_invalid", "emoji")
  }
  if (o.float !== undefined && o.float !== null) amount(o, "float", 0n, 10n ** 25n)
  if (o.extras !== undefined && o.extras !== null) checkExtras(o.extras, ctx.nowMs)
  intentMust(ctx, "create_pot")
  return {
    rule: "R2",
    methods: ["create_pot"],
    intent: "create_pot",
    family: "create",
    potId: `${slug}.${ctx.hubId}`,
    needsOpenPot: false,
    estYocto: near("0.005"),
    hubYocto: near("0.061"),
    create: { slug },
  }
}

// R3 request_spend, 100-150 Tgas; hub 1.1.0 pay-by-link requests (`link`) 100-300 Tgas
function r3(call: Extract<DecodedAction, { kind: "functionCall" }>, ctx: PolicyContext): PolicyMatch {
  gasFor(call)
  const o = argsObject(call)
  keys(o, ["pot", "amount", "receiver_id", "category", "request_ref"], ["link"])
  const pot = potArg(o, ctx.hubId)
  const amt = amount(o, "amount", 1n, MAX_SPEND)
  if (!isAccountId(o.receiver_id)) deny("args_invalid", "receiver_id")
  const link = o.link !== undefined && o.link !== null
  if (link) {
    const l = o.link
    if (typeof l !== "object" || Array.isArray(l)) return deny("args_invalid", "link")
    const lo = l as Obj
    keys(lo, ["claim_pk"], ["expires_at_ms"])
    if (typeof lo.claim_pk !== "string" || !parseEd25519PublicKey(lo.claim_pk)) deny("args_invalid", "link.claim_pk")
    const e = lo.expires_at_ms
    if (e !== undefined && e !== null) {
      if (typeof e !== "number" || !Number.isSafeInteger(e) || e <= ctx.nowMs + LINK_MIN_TTL_MS || e > ctx.nowMs + LINK_MAX_TTL_MS)
        deny("args_invalid", "link.expires_at_ms")
    }
    // the escrow: a link request always names the hub
    if (o.receiver_id !== ctx.hubId) deny("args_invalid", "receiver_id", "link_needs_hub")
  } else if (call.gas > BigInt(PLAIN_SPEND_MAX_TGAS) * TGAS) {
    throw new ApiError("gas_cap", { detail: { min: 100e12, max: PLAIN_SPEND_MAX_TGAS * 1e12, gas: call.gas.toString() } })
  }
  if (!CATEGORIES.includes(o.category as (typeof CATEGORIES)[number])) deny("args_invalid", "category")
  const ref = o.request_ref
  if (typeof ref !== "string" || !OPKEY_RE.test(ref)) return deny("args_invalid", "request_ref")
  if (ctx.requestRef !== undefined && ctx.requestRef !== ref) deny("args_invalid", "requestRef", "mismatch")
  intentMust(ctx, "request_spend")
  return {
    rule: "R3",
    methods: ["request_spend"],
    intent: "request_spend",
    family: "spend",
    potId: pot,
    needsOpenPot: true,
    estYocto: near("0.003"),
    hubYocto: near("0.011"),
    spend: { requestRef: ref, amount: amt, receiverId: o.receiver_id as string, ...(link ? { link: true } : {}) },
    amount: amt,
  }
}

// R4 join, 100-150 Tgas
function r4(call: Extract<DecodedAction, { kind: "functionCall" }>, ctx: PolicyContext): PolicyMatch {
  gasFor(call)
  const o = argsObject(call)
  keys(o, ["pot", "invite_pk", "signature"])
  const pot = potArg(o, ctx.hubId)
  if (typeof o.invite_pk !== "string" || !parseEd25519PublicKey(o.invite_pk)) deny("args_invalid", "invite_pk")
  const sig = o.signature
  if (typeof sig !== "string" || !/^[A-Za-z0-9+/]{86}==$/.test(sig) || Buffer.from(sig, "base64").length !== 64)
    deny("args_invalid", "signature")
  intentMust(ctx, "join")
  return {
    rule: "R4",
    methods: ["join"],
    intent: "join",
    family: "join",
    potId: pot,
    needsOpenPot: true,
    estYocto: near("0.0025"),
    hubYocto: near("0.009"),
  }
}

function inviteArgs(call: Extract<DecodedAction, { kind: "functionCall" }>, ctx: PolicyContext): string {
  const o = argsObject(call)
  if (call.method === "add_invite") {
    keys(o, ["pot", "invite_pk"], ["expires_at_ms", "max_uses"])
    const e = o.expires_at_ms
    if (e !== undefined && e !== null) {
      if (typeof e !== "number" || !Number.isSafeInteger(e) || e <= ctx.nowMs || e > ctx.nowMs + INVITE_MAX_TTL_MS)
        deny("args_invalid", "expires_at_ms")
    }
    const m = o.max_uses
    if (m !== undefined && m !== null) {
      if (typeof m !== "number" || !Number.isInteger(m) || m < 1 || m > INVITE_MAX_USES) deny("args_invalid", "max_uses")
    }
  } else keys(o, ["pot", "invite_pk"])
  if (typeof o.invite_pk !== "string" || !parseEd25519PublicKey(o.invite_pk)) deny("args_invalid", "invite_pk")
  return potArg(o, ctx.hubId)
}

// R5 add_invite / revoke_invite, 10-50 Tgas each
function r5single(call: Extract<DecodedAction, { kind: "functionCall" }>, ctx: PolicyContext): PolicyMatch {
  gasFor(call)
  const pot = inviteArgs(call, ctx)
  const add = call.method === "add_invite"
  intentMust(ctx, add ? "add_invite" : "revoke_invite")
  return {
    rule: "R5",
    methods: [call.method],
    intent: add ? "add_invite" : "revoke_invite",
    family: "invite",
    potId: pot,
    needsOpenPot: add,
    estYocto: near("0.002"),
    hubYocto: add ? near("0.0015") : 0n,
  }
}

// R5 rotate pair [revoke_invite, add_invite] on the same Pot, ≤ 100 Tgas total
function r5pair(calls: Extract<DecodedAction, { kind: "functionCall" }>[], ctx: PolicyContext): PolicyMatch {
  for (const c of calls) depositFor(c)
  for (const c of calls) gasFor(c)
  if (calls[0]!.gas + calls[1]!.gas > 100n * TGAS)
    throw new ApiError("gas_cap", { detail: { max: 100e12, why: "pair_total" } })
  const p1 = inviteArgs(calls[0]!, ctx)
  const p2 = inviteArgs(calls[1]!, ctx)
  if (p1 !== p2) deny("args_invalid", "pot", "pair_mismatch")
  intentMust(ctx, "rotate_invite")
  return {
    rule: "R5",
    methods: ["revoke_invite", "add_invite"],
    intent: "rotate_invite",
    family: "invite",
    potId: p1,
    needsOpenPot: true,
    estYocto: near("0.004"),
    hubYocto: near("0.0015"),
  }
}

// R6 set_rules 10-50 Tgas; R7 propose_rules 80-150 Tgas
function r6r7(call: Extract<DecodedAction, { kind: "functionCall" }>, ctx: PolicyContext): PolicyMatch {
  const propose = call.method === "propose_rules"
  gasFor(call)
  const o = argsObject(call)
  keys(o, ["pot", "rules"], ["extras"])
  const pot = potArg(o, ctx.hubId)
  checkRules(o.rules, "rules", ctx)
  if (o.extras !== undefined && o.extras !== null) checkExtras(o.extras, ctx.nowMs)
  intentMust(ctx, propose ? "propose_rules" : "set_rules")
  return {
    rule: propose ? "R7" : "R6",
    methods: [call.method],
    intent: propose ? "propose_rules" : "set_rules",
    family: "rules",
    potId: pot,
    needsOpenPot: true,
    estYocto: near("0.002"),
    hubYocto: propose ? near("0.01") : 0n,
  }
}

// R8 propose_close 150-300 Tgas
function r8(call: Extract<DecodedAction, { kind: "functionCall" }>, ctx: PolicyContext): PolicyMatch {
  gasFor(call)
  const o = argsObject(call)
  keys(o, ["pot"])
  const pot = potArg(o, ctx.hubId)
  intentMust(ctx, "propose_close")
  return {
    rule: "R8",
    methods: ["propose_close"],
    intent: "propose_close",
    family: "close",
    potId: pot,
    needsOpenPot: true,
    estYocto: near("0.003"),
    // 0.008 + 0.0025·n; refined with the member count in the chain checks
    hubYocto: near("0.008") + near("0.0025") * 10n,
  }
}

// R9 retry_payout 80-150 / sync 50-150 (callable by anyone)
function r9(call: Extract<DecodedAction, { kind: "functionCall" }>, ctx: PolicyContext): PolicyMatch {
  const retry = call.method === "retry_payout"
  gasFor(call)
  const o = argsObject(call)
  keys(o, ["pot", "proposal_id"])
  const pot = potArg(o, ctx.hubId)
  const pid = u64(o, "proposal_id")
  intentMust(ctx, "retry_payout")
  return {
    rule: "R9",
    methods: [call.method],
    intent: "retry_payout",
    family: "maintenance",
    potId: pot,
    needsOpenPot: false,
    estYocto: near("0.002"),
    hubYocto: 0n,
    ...(retry ? { retry: { proposalId: pid } } : { sync: { proposalId: pid } }),
  }
}

// R13 ok_request (hub 1.1.0): another member's OK on a one-OK request, 100-250 Tgas, 0 deposit
function r13(call: Extract<DecodedAction, { kind: "functionCall" }>, ctx: PolicyContext): PolicyMatch {
  gasFor(call)
  const o = argsObject(call)
  keys(o, ["pot", "request_id"])
  const pot = potArg(o, ctx.hubId)
  const requestId = u64(o, "request_id")
  intentMust(ctx, "ok_request")
  return {
    rule: "R13",
    methods: ["ok_request"],
    intent: "ok_request",
    family: "vote",
    potId: pot,
    needsOpenPot: true,
    estYocto: near("0.003"),
    hubYocto: 0n,
    requestId,
  }
}

// R14 claim_link (hub 1.1.0): authorized by the link signature, not by the sender (any signed-in person
// may claim, typically a brand-new 0-NEAR account); 50-150 Tgas, 0 deposit (the hub sponsors the token
// registration of the receiver: CLAIM_HUB_YOCTO against the hub budget quota)
function r14(call: Extract<DecodedAction, { kind: "functionCall" }>, ctx: PolicyContext): PolicyMatch {
  gasFor(call)
  const o = argsObject(call)
  keys(o, ["pot", "request_id", "receiver_id", "signature"])
  const pot = potArg(o, ctx.hubId)
  const requestId = u64(o, "request_id")
  const r = o.receiver_id
  if (!isAccountId(r) || r === ctx.hubId || r === ctx.usdcId || daoSlug(r, ctx.hubId)) deny("args_invalid", "receiver_id")
  const sig = o.signature
  if (typeof sig !== "string" || !/^[A-Za-z0-9+/]{86}==$/.test(sig) || Buffer.from(sig, "base64").length !== 64)
    deny("args_invalid", "signature")
  intentMust(ctx, "claim_link")
  return {
    rule: "R14",
    methods: ["claim_link"],
    intent: "claim_link",
    family: "spend",
    potId: pot,
    needsOpenPot: false,
    estYocto: near("0.002"),
    hubYocto: CLAIM_HUB_YOCTO,
    requestId,
  }
}

// R15 reclaim_link (hub 1.1.0): the requester's cancel, or anyone after expiry; 30-100 Tgas
function r15(call: Extract<DecodedAction, { kind: "functionCall" }>, ctx: PolicyContext): PolicyMatch {
  gasFor(call)
  const o = argsObject(call)
  keys(o, ["pot", "request_id"])
  const pot = potArg(o, ctx.hubId)
  const requestId = u64(o, "request_id")
  intentMust(ctx, "reclaim_link")
  return {
    rule: "R15",
    methods: ["reclaim_link"],
    intent: "reclaim_link",
    family: "spend",
    potId: pot,
    needsOpenPot: false,
    estYocto: near("0.002"),
    hubYocto: 0n,
    requestId,
  }
}

// R11 act_proposal on a hub DAO: exact gas by kind (100 Transfer/AddMemberToRole, 300 FunctionCall)
function r11(call: Extract<DecodedAction, { kind: "functionCall" }>, daoId: string, ctx: PolicyContext): PolicyMatch {
  if (call.method !== "act_proposal") throw new ApiError("method_not_allowed", { detail: { method: call.method } })
  depositFor(call)
  const o = argsObject(call)
  // gas depends on the kind, so read the kind first (args are validated fully below)
  const kind = o.proposal
  const kindName =
    typeof kind === "object" && kind !== null && !Array.isArray(kind) && Object.keys(kind).length === 1
      ? (Object.keys(kind)[0] as string)
      : null
  if (kindName !== "Transfer" && kindName !== "AddMemberToRole" && kindName !== "FunctionCall")
    return deny("args_invalid", "proposal")
  const want = kindName === "FunctionCall" ? 300n : 100n
  if (call.gas !== want * TGAS)
    throw new ApiError("gas_cap", { detail: { min: Number(want) * 1e12, max: Number(want) * 1e12, gas: call.gas.toString() } })
  keys(o, ["id", "action", "proposal"]) // memo must be absent (it would be logged publicly)
  const id = u64(o, "id")
  const action = o.action
  if (action !== "VoteApprove" && action !== "VoteReject" && action !== "Finalize") return deny("args_invalid", "action")
  intentMust(ctx, "vote")
  const heavy = kindName === "FunctionCall" || action === "Finalize"
  return {
    rule: "R11",
    methods: ["act_proposal"],
    intent: "vote",
    family: "vote",
    potId: daoId,
    needsOpenPot: false,
    estYocto: (heavy ? near("0.03") : near("0.001")) + near("0.0006"),
    hubYocto: 0n,
    vote: { daoId, proposalId: id, action, kind: kind as Record<string, unknown>, kindName },
  }
}

// Test-only allowlist rule (never on production or mainnet; config.testAllowlist is empty there)
function testRule(call: Extract<DecodedAction, { kind: "functionCall" }>, receiver: string, ctx: PolicyContext): PolicyMatch {
  const rule = ctx.testAllowlist!.find((t) => t.receiver === receiver && t.method === call.method)
  if (!rule) throw new ApiError("method_not_allowed", { detail: { method: call.method } })
  depositExactly(call, rule.deposit)
  if (call.gas < TGAS || call.gas > rule.maxGas)
    throw new ApiError("gas_cap", { detail: { min: 1e12, max: Number(rule.maxGas) } })
  argsObject(call)
  return {
    rule: "TEST",
    methods: [call.method],
    intent: "test",
    family: "test",
    potId: null,
    needsOpenPot: false,
    estYocto: near("0.001") + rule.deposit,
    hubYocto: 0n,
  }
}
