// Live money actions (F-09…F-12, F-13 join; frontend-architecture §5): intent → device-key delegate (or demo
// intent) → POST /api/relay → result → invalidate (§3.4) → settle at the relay's block (§3.5).
// Each returns the same shapes as the mock store so the sheets and machines don't change.
import {
  isValidSlug,
  newOpKey,
  secretToSeed,
  signJoinWebCrypto,
  type ActionIntent,
  type Api,
  type Category,
  type Micro,
  type Proposal,
  type PublicKeyStr,
  type RuleExtras,
  type Rules,
} from "@pot/sdk"
import { daoOf, sdkConfig } from "../config"
import { ActionError } from "../errors"
import { slugify } from "../mock/world"
import type { RequestVM, XcAddRecord } from "../mock/types"
import { queryClient } from "../query"
import { api } from "./api"
import { signingChain as chain } from "./chain"
import { saveInvite, loadInvite } from "./invites"
import { qk } from "./queries"
import { followRelay, innerError, type RelayOk } from "./relay"
import { ensureLiveSession } from "./session"
import { invalidatePot, settleAt, settlePot } from "./settle"
import { loadEngine, send } from "./signing"

const FAUCET_MIN: Micro = 50_000_000n
const FAUCET_MAX: Micro = 500_000_000n

async function me(): Promise<string> {
  const s = await ensureLiveSession()
  if (!s) throw new ActionError("session", "not_signed_in")
  return s.accountId
}

function failIfInner(r: RelayOk): void {
  const code = innerError(r)
  if (code) throw new ActionError("failed", code, { txHash: r.txHash })
}

/** Settle in the background (the caller already has its answer). */
const background = (p: Promise<unknown>) => void p.catch(() => {})

// ------------------------------------------------------------------------------------------------- add money

/** §5.5: top up from the faucet when this person's demo dollars fall short, then ft_transfer_call to the hub. */
export interface AddMoneyOptions {
  source?: "demo" | "pot_dollars"
  /** integrations (D-50): `depositIntentId` of an arrived any-chain deposit */
  context?: Api.RelayContext
  /** integrations (D-50): the relay outcome, e.g. to mark the deposit ADDED */
  onRelayed?: (r: RelayOk) => void
  /** mock only: the arrived deposit this add came from (the mock world keeps it for the money-in details) */
  xc?: XcAddRecord
}

export async function addMoney(slug: string, amount: Micro, opts: AddMoneyOptions = {}): Promise<string> {
  const account = await me()
  const dao = daoOf(slug)
  if ((opts.source ?? "demo") === "demo") {
    const own = (await chain().usdc.balanceOf(account as never)).value
    if (own < amount) {
      let claim = amount - own
      if (claim < FAUCET_MIN) claim = FAUCET_MIN
      if (claim > FAUCET_MAX) claim = FAUCET_MAX
      await api("POST", "/api/faucet", { amount: claim.toString(), idempotencyKey: newOpKey() })
    }
  }
  // the source rides along so the money-in details can say where it came from (kept on the add's feed row)
  const r = await send({ type: "add_money", pot: dao as never, amount }, { context: { ...(opts.context ?? {}), source: opts.source ?? "demo" } })
  failIfInner(r)
  opts.onRelayed?.(r)
  if (r.result?.type !== "contribution" || !r.result.recorded) throw new ActionError("failed", "not_recorded", { txHash: r.txHash })
  invalidatePot(dao, [qk.usdc(account)])
  // keep "+$X on the way" until the heartbeat views reach the relay's block (then the hero counts up and the
  // projection drops in the same render, never both); members and the feed follow in the background
  await settleAt([qk.view(dao), qk.balance(dao)], r.executedAtBlock)
  background(settlePot(dao, r.executedAtBlock))
  return `contribution:${r.txHash}`
}

// ------------------------------------------------------------------------------------------------- spend

export interface LiveSpendInput {
  amount: Micro
  category: Category
  note?: string
  receiver: string
  /** pay by link (hub 1.1.0): the receiver is the hub's escrow; the link key's secret stays on this device */
  link?: { claimPk: string; expiresAtMs: number }
  /** the request's request_ref: its op id (+ the receipt fingerprint when details are attached; the caller keeps
   *  the link secret / the receipt under it before sending) */
  requestRef?: string
}

export interface LiveSpendResult {
  id: number
  proposalId: number | null
  path: "instant" | "vote"
  payout: "sent" | "failed" | "pending" | "refused"
  /** the final payout of an instant spend (two-phase answer, api-spec §3.4) */
  final: Promise<"sent" | "failed" | "pending" | "refused">
  txHash: string
}

const payoutOf = (r: RelayOk): "sent" | "failed" | "pending" | "refused" => {
  // the early answer said approved; a later hub check (balance, payee, DAO group) can still refuse (REFUSED_*)
  if (r.final && r.outcome === "inner_failed") return "refused"
  const res = r.result
  if (res?.type !== "spend") return "pending"
  if (res.payout === "sent") return "sent"
  if (res.payout === "failed" || r.events.some((e) => e.event === "spend_payout_failed")) return "failed"
  return r.final && res.path === "instant" && r.outcome === "success" ? "sent" : "pending"
}

/**
 * §5.2 / §5.3: the memo goes first (POST /api/notes, keyed by request_ref), then `request_spend`. A vote-path
 * request is followed by the requester's own approval (D-61), a second delegate to the DAO with the exact kind.
 */
export async function requestSpend(slug: string, input: LiveSpendInput): Promise<LiveSpendResult> {
  await me()
  const dao = daoOf(slug)
  const requestRef = input.requestRef ?? newOpKey()
  const note = input.note?.trim()
  if (note) background(api("POST", "/api/notes", { kind: "memo", pot: dao, ref: requestRef, text: note, idempotencyKey: newOpKey() }))
  const link = input.link ? { claimPk: input.link.claimPk as PublicKeyStr, expiresAtMs: input.link.expiresAtMs } : undefined
  const receiverId = link ? sdkConfig().hubId : input.receiver
  const r = await send({ type: "request_spend", pot: dao as never, amount: input.amount, receiverId: receiverId as never, category: input.category, requestRef, ...(link ? { link } : {}) })
  failIfInner(r)
  const res = r.result
  if (res?.type !== "spend") throw new ActionError("failed", "no_spend_result", { txHash: r.txHash })
  invalidatePot(dao, link ? [] : [qk.usdc(input.receiver)])
  if (res.path === "vote") {
    // the early answer may not know the proposal yet: follow the relay to its final body for the id
    const pid = res.proposalId ?? ((await followRelay(r)).result as { proposalId?: number | null } | null)?.proposalId ?? null
    try {
      if (pid !== null) await castVote(dao, pid, "Approve")
    } catch {
      /* the request stands; the RequestCard offers the approval again (§5.3 VOTE_ERR) */
    }
    background(settlePot(dao, r.executedAtBlock))
    return { id: res.requestId, proposalId: pid, path: "vote", payout: "pending", final: Promise.resolve("pending"), txHash: r.txHash }
  }
  const early = payoutOf(r)
  const final =
    early !== "pending"
      ? Promise.resolve(early)
      : followRelay(r).then((f) => {
          const p = payoutOf(f)
          background(settlePot(dao, f.executedAtBlock))
          return p === "pending" && f.final ? "sent" : p
        })
  if (early !== "pending") background(settlePot(dao, r.executedAtBlock))
  return { id: res.requestId, proposalId: res.proposalId, path: "instant", payout: early, final, txHash: r.txHash }
}

// ------------------------------------------------------------------------------------------------- votes

export type LiveVoteResult = "counted" | "approved" | "declined" | "already" | "decided" | "expired" | "not_member"

/** rev4 M-10: the thing voted on is the proposal's own kind; refuse when it doesn't match what the UI shows. */
function kindMatches(p: Proposal, expect?: { amount: Micro; receiver: string }): boolean {
  if (!expect) return true
  const k = p.kind as { Transfer?: { receiver_id: string; amount: string } }
  if (!k || typeof k !== "object" || !k.Transfer) return true // join / close / rules kinds aren't spends
  return k.Transfer.receiver_id === expect.receiver && BigInt(k.Transfer.amount) === expect.amount
}

async function castVote(dao: string, proposalId: number, v: "Approve" | "Reject", expect?: { amount: Micro; receiver: string }): Promise<LiveVoteResult> {
  const account = await me()
  const c = chain()
  // rev4 H-2: act only on proposals the hub created and still tracks. Views are `final`: a proposal made a
  // moment ago (the requester's own approval) shows up ≈ 2 blocks later, so wait for it briefly.
  let subject = null
  let p = null
  for (let i = 0; i < 12; i++) {
    ;[subject, p] = await Promise.all([
      c.hub.getProposalSubject(dao as never, proposalId).then((x) => x.value),
      c.dao.getProposal(dao as never, proposalId).then((x) => x.value),
    ])
    if (subject && p) break
    await new Promise((r) => setTimeout(r, 700))
  }
  if (!subject || !subject.live) return "decided"
  if (!p) return "decided"
  if (p.votes[account]) return "already"
  if (p.status === "Expired") return "expired"
  if (p.status !== "InProgress") return "decided"
  if (!kindMatches(p, expect)) throw new ActionError("bug", "kind_mismatch")
  let r: RelayOk
  try {
    r = await send({ type: "vote", pot: dao as never, proposalId, kind: p.kind, action: v === "Approve" ? "VoteApprove" : "VoteReject" } as ActionIntent)
  } catch (e) {
    if (e instanceof ActionError && e.reason === "already_voted") return "already"
    if (e instanceof ActionError && e.reason === "proposal_not_open") return "decided"
    if (e instanceof ActionError && e.reason === "not_a_member") return "not_member"
    throw e
  }
  const code = innerError(r)
  if (code === "ERR_ALREADY_VOTED") return "already"
  if (code === "ERR_PROPOSAL_NOT_READY_FOR_VOTE" || code === "ERR_PROPOSAL_NOT_IN_PROGRESS") return "decided"
  if (code) throw new ActionError("failed", code, { txHash: r.txHash })
  invalidatePot(dao)
  background(settlePot(dao, r.executedAtBlock))
  const res = r.result
  if (res?.type === "vote") {
    if (res.proposalStatus === "Approved") return "approved"
    if (res.proposalStatus === "Rejected") return "declined"
    if (res.proposalStatus === "Expired") return "expired"
  }
  return v === "Reject" ? "declined" : "counted"
}

export async function vote(req: Pick<RequestVM, "slug" | "id" | "proposalId" | "amount" | "receiver">, v: "Approve" | "Reject"): Promise<LiveVoteResult> {
  if (req.proposalId === null || req.proposalId === undefined) return "decided"
  const r = await castVote(daoOf(req.slug), req.proposalId, v, { amount: req.amount, receiver: req.receiver.id })
  // a decline is "counted" unless it decided the request; the sheet words both the same way
  return r
}

// ------------------------------------------------------------------------------------------------- create + invites

export interface LiveCreateInput {
  name: string
  emoji: string
  cover: number
  goalEachCents: number | null
  rules: Rules
  invite: { pk: string; secret: string }
  /** hub 1.1.0 rule extras (trust, one-OK ceiling, goal); omitted = the hub's defaults */
  extras?: RuleExtras
}

const suffix = () => Math.random().toString(36).slice(2, 6).padEnd(4, "0")

/** §5.10: one `create_pot` delegate with the first invite key; a taken slug silently gets a new suffix. */
export async function createPot(input: LiveCreateInput): Promise<string> {
  await me()
  const base = slugify(input.name)
  for (let attempt = 0; attempt < 3; attempt++) {
    const s = `${isValidSlug(base) ? base : "pot"}-${suffix()}`
    let r: RelayOk
    try {
      r = await send(
        {
          type: "create_pot",
          slug: s as never,
          name: input.name.trim(),
          preset: "custom",
          rules: input.rules,
          invitePk: input.invite.pk as PublicKeyStr,
          emoji: input.emoji,
          ...(input.extras ? { extras: input.extras } : {}),
        },
        {
          context: {
            meta: {
              gradient: String(input.cover),
              ...(input.goalEachCents !== null && input.goalEachCents >= 100 ? { goalEach: String(BigInt(input.goalEachCents) * 10_000n) } : {}),
            },
          },
        },
      )
    } catch (e) {
      if (e instanceof ActionError && e.reason === "slug_taken") continue
      throw e
    }
    const code = innerError(r)
    if (code === "ERR_SLUG_TAKEN") continue
    if (code === "ERR_CREATOR_DAILY_LIMIT") throw new ActionError("specific", code, { txHash: r.txHash })
    if (code) throw new ActionError("failed", code, { txHash: r.txHash })
    const slug = r.result?.type === "create_pot" ? r.result.slug : s
    const dao = daoOf(slug)
    await saveInvite({ pot: dao, pk: input.invite.pk, secret: input.invite.secret, createdAt: Date.now() })
    try {
      localStorage.setItem(`pot.goal.${slug}`, input.goalEachCents === null ? "off" : String(BigInt(input.goalEachCents) * 10_000n))
    } catch {}
    void queryClient().invalidateQueries({ queryKey: ["potsOf"] })
    await settleAt([qk.view(dao)], r.executedAtBlock).catch(() => false)
    return slug
  }
  throw new ActionError("specific", "slug_taken")
}

/** [Make a new link]: rotate this device's link (revoke + add in one delegate), else add a new one. */
export async function rotateInvite(slug: string, invite: { pk: string; secret: string }): Promise<void> {
  await me()
  const dao = daoOf(slug)
  const stored = await loadInvite(dao)
  let active = false
  if (stored) active = (await chain().hub.getInvite(dao as never, stored.pk as never).catch(() => null))?.value?.status === "active"
  const r = await send(
    stored && active
      ? { type: "rotate_invite", pot: dao as never, oldPk: stored.pk as PublicKeyStr, newPk: invite.pk as PublicKeyStr }
      : { type: "add_invite", pot: dao as never, invitePk: invite.pk as PublicKeyStr },
  )
  failIfInner(r)
  await saveInvite({ pot: dao, pk: invite.pk, secret: invite.secret, createdAt: Date.now() })
  invalidatePot(dao)
  await settlePot(dao, r.executedAtBlock).catch(() => {})
}

// ------------------------------------------------------------------------------------------------- join

export type LiveJoinResult = "joined" | "already_member" | "invalid" | "closed" | "used_up" | "expired"

/** §5.1 `joining`: sign the D-08 message `pot-join:v1:<dao>:<joiner>` with the invite seed, relay `join`. */
export async function join(slug: string, secret: string): Promise<LiveJoinResult> {
  const account = await me()
  const dao = daoOf(slug)
  const seed = secretToSeed(secret)
  let sig: { invitePk: PublicKeyStr; signature: string }
  try {
    sig = await signJoinWebCrypto(seed, dao, account)
  } catch {
    sig = (await loadEngine()).signJoin(seed, dao, account)
  }
  let r: RelayOk
  try {
    r = await send({ type: "join", pot: dao as never, invitePk: sig.invitePk, signature: sig.signature })
  } catch (e) {
    if (e instanceof ActionError && e.reason === "pot_closed") return "closed"
    if (e instanceof ActionError && e.reason === "pot_unknown") return "invalid"
    throw e
  }
  const code = innerError(r)
  switch (code) {
    case null:
      break
    case "ERR_ALREADY_MEMBER":
      return "already_member"
    case "ERR_POT_NOT_OPEN":
    case "ERR_POT_NOT_FOUND":
      return "closed"
    case "ERR_INVITE_EXPIRED":
      return "expired"
    case "ERR_INVITE_USED_UP":
      return "used_up"
    case "ERR_INVITE_NOT_FOUND":
    case "ERR_INVITE_REVOKED":
    case "ERR_BAD_SIGNATURE":
      return "invalid"
    default:
      throw new ActionError("failed", code, { txHash: r.txHash })
  }
  void queryClient().invalidateQueries({ queryKey: ["potsOf"] })
  invalidatePot(dao)
  await settlePot(dao, r.executedAtBlock).catch(() => {})
  return "joined"
}

// ------------------------------------------------------------------------------------------------- close (P-9)

export type LiveCloseResult = { proposalId: number; status: "needs" | "approved" }

/**
 * propose_close (the hub computes the pro-rata payouts into one FunctionCall proposal), then the proposer's own
 * approval at 300 Tgas with the exact kind. Money that moved in the last minute → ERR_POT_BUSY (`close.busy`).
 */
export async function proposeClose(slug: string): Promise<LiveCloseResult> {
  await me()
  const dao = daoOf(slug)
  const r = await send({ type: "propose_close", pot: dao as never })
  const code = innerError(r)
  if (code) throw new ActionError("specific", code, { txHash: r.txHash })
  if (r.result?.type !== "close") throw new ActionError("failed", "no_close_result", { txHash: r.txHash })
  const proposalId = r.result.proposalId
  invalidatePot(dao)
  let status: LiveCloseResult["status"] = "needs"
  try {
    status = (await castVote(dao, proposalId, "Approve")) === "approved" ? "approved" : "needs"
  } catch {
    /* the close stands; the Close sheet offers the approval again */
  }
  background(settlePot(dao, r.executedAtBlock))
  return { proposalId, status }
}

/** Approve (or decline) the open close proposal; the final approval pays everyone out (300 Tgas). */
export async function voteClose(slug: string, proposalId: number, v: "Approve" | "Reject"): Promise<LiveVoteResult> {
  return castVote(daoOf(slug), proposalId, v)
}

// ------------------------------------------------------------------------------------------------- rules (P-8)

export type LiveRulesResult = { proposalId: number | null; status: "needs" | "approved" }

/**
 * Several members: propose_rules (the hub adds a FunctionCall proposal for set_rules), then the proposer's own
 * approval with the exact kind at 300 Tgas (FunctionCall votes, R11). At most one open rules request per Pot
 * (ERR_RULES_PENDING); the change applies once the group approves (the DAO calls hub.set_rules).
 */
export async function proposeRules(slug: string, rules: Rules, extras?: RuleExtras): Promise<LiveRulesResult> {
  await me()
  const dao = daoOf(slug)
  const r = await send({ type: "propose_rules", pot: dao as never, rules, ...(extras ? { extras } : {}) })
  const code = innerError(r)
  if (code) throw new ActionError("specific", code, { txHash: r.txHash })
  const res = r.result
  if (res?.type !== "rules") throw new ActionError("failed", "no_rules_result", { txHash: r.txHash })
  if (res.applied) {
    background(settlePot(dao, r.executedAtBlock))
    return { proposalId: null, status: "approved" }
  }
  const pid = res.proposalId ?? ((await followRelay(r)).result as { proposalId?: number } | null)?.proposalId ?? null
  invalidatePot(dao)
  let status: LiveRulesResult["status"] = "needs"
  try {
    if (pid !== null) status = (await castVote(dao, pid, "Approve")) === "approved" ? "approved" : "needs"
  } catch {
    /* the request stands; the Rules tab offers the approval again */
  }
  background(settlePot(dao, r.executedAtBlock))
  return { proposalId: pid, status }
}

/** Sole member: set_rules applies at once (30 Tgas). */
export async function setRules(slug: string, rules: Rules, extras?: RuleExtras): Promise<void> {
  await me()
  const dao = daoOf(slug)
  const r = await send({ type: "set_rules", pot: dao as never, rules, ...(extras ? { extras } : {}) })
  const code = innerError(r)
  if (code) throw new ActionError("specific", code, { txHash: r.txHash })
  invalidatePot(dao)
  await settlePot(dao, r.executedAtBlock).catch(() => {})
}

/** Approve (or decline) the open rules request: a 300 Tgas vote on its FunctionCall kind. */
export async function voteRules(slug: string, proposalId: number, v: "Approve" | "Reject"): Promise<LiveVoteResult> {
  return castVote(daoOf(slug), proposalId, v)
}

/** The group's "about $X each" (Settings, or this browser's pre-server value): saved on the Pot's server row. */
export async function setGoalEach(slug: string, each: Micro | null): Promise<void> {
  await ensureLiveSession()
  await api("PUT", `/api/pots/${slug}/goal-each`, { goalEach: each === null ? null : each.toString() })
  try {
    localStorage.setItem(`pot.goal.${slug}`, each === null ? "off" : each.toString())
  } catch {}
  await invalidatePot(daoOf(slug))
}
