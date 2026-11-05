"use client"
// Money actions = intent → sign → relay → pending op (frontend-architecture §3.4, §6), one implementation per
// data source: the mock store (deterministic latencies, fault injection) or live (lib/client/live/actions.ts:
// device-key delegates / demo intents through POST /api/relay, settled at the relay's block). Every action:
//  - refuses while offline (ops are never queued offline; the caller shows `*.offline`),
//  - shows an optimistic item at once ("Sending…"),
//  - on failure reverts it and shows ONE toast with the flow's copy key (what happened, whether money moved,
//    what to do), and on success one announcement or toast, never both (WCAG 4.1.3).
import { rememberEntry } from "./onboarding"
import { toast } from "sonner"
import { t, type MessageKey } from "@/i18n/t"
import { announce, isOnline } from "./browser"
import { IS_LIVE } from "./config"
import { ActionError, isTransportError } from "./errors"
import type { RuleExtras, Rules as SdkRules } from "@pot/sdk"
import { formatUsd, toCents, type Micro } from "./money"
import * as store from "./mock/store"
import { mockTxHash } from "./mock/world"
import type { Category, RequestVM } from "./mock/types"
import type { PersonaId } from "./mock/fixtures"
import { ops, type OpHandle } from "./ops/store"
import { coachTrigger } from "./pwa/coach"
import * as live from "./live/actions"
import * as liveWave4 from "./live/wave4"
import { extrasRecOf } from "./wave4-form"
import { newOpKey, receiptFingerprintOfRef, spendRef } from "@pot/sdk"
import { receiptFingerprint, shortFingerprint, type SavedReceipt } from "@/lib/receipt-saved"
import { attachReceipt, keepPendingReceipt } from "./receipts/saved"
import { refreshTopups } from "./topups/actions"

function revertToast(key: MessageKey) {
  toast.error(t(key as "generic.error"))
}

/**
 * The Add money failure copy (2026-11-02: every refusal used to read "That didn't go through", whatever the cause).
 * Transport / capacity problems keep `add.error.relayer` / `relayer.cap`; a known reason gets its own words.
 */
export function addErrorKey(e: unknown): MessageKey {
  if (e instanceof ActionError) {
    if (e.cls === "rate_limited") return "relayer.cap"
    if (isTransportError(e)) return "add.error.relayer"
    switch (e.reason) {
      case "wallet_account_mismatch":
      case "sender_mismatch":
        return "add.error.other_account"
      case "reconnect_wallet":
      case "key_not_found":
      case "key_not_allowed":
      case "bad_signature":
      case "not_signed_in":
        return "add.error.sign_in_again"
      case "wallet_declined":
        return "add.error.not_approved"
      case "nonce_pending":
      case "nonce_used":
      case "expired":
      case "ttl_too_long":
        return "add.error.busy"
      case "pot_closed":
        return "add.error.closed"
      case "not_a_member":
        return "add.error.not_member"
    }
    return "add.error.generic"
  }
  return "add.error.relayer"
}

export function addMoney(
  pot: { slug: string; name: string; balance: Micro },
  amount: Micro,
  actor: string,
  opts: live.AddMoneyOptions = {},
): OpHandle | null {
  if (!isOnline()) {
    toast(t("add.offline"))
    return null
  }
  let errorKey: MessageKey = "add.error.relayer"
  return ops.run(
    { kind: "add", pot: pot.slug, actor, amount },
    async () => {
      // the mock has no deposit ledger: an arrived any-chain deposit is added as it lands (net zero for own dollars),
      // with its record (the money-in details: coin, network, what was sent and what arrived, the moments)
      if (!IS_LIVE) return void (await store.addMoney(pot.slug, toCents(amount), opts.context?.depositIntentId ? "demo" : opts.source, opts.xc))
      try {
        return await live.addMoney(pot.slug, amount, opts)
      } catch (e) {
        errorKey = addErrorKey(e)
        // the reason behind the toast, for anyone looking (support, the console): the copy stays plain words
        if (e instanceof ActionError) console.warn(`[add money] ${e.cls}: ${e.reason}${e.requestId ? ` (${e.requestId})` : ""}`)
        throw e
      }
    },
    {
      errorKey: "add.error.relayer",
      onError: () => revertToast(errorKey),
      onSuccess: () => {
        toast.success(t("add.success", { potName: pot.name, balance: formatUsd(pot.balance + amount) }))
        coachTrigger(pot.slug, "contribution") // F-23: install is earned after the first contribution
        // "Ask for a top-up": the asks' progress moves with every add (the server reads it from the hub)
        if (IS_LIVE) refreshTopups()
      },
    },
  )
}

export type VoteResult = "counted" | "approved" | "declined" | "already" | "decided" | "expired" | "not_member"

/**
 * Inline approve with a 4 s Undo window (ux-spec 6.4 A; only for signers that need no gesture). The op stays
 * `queued` until the window ends, so Undo sends nothing.
 */
export function approveInline(req: RequestVM, actor: string, undoMs = 4000): OpHandle | null {
  if (!isOnline()) {
    toast(t("approve.offline"))
    return null
  }
  return ops.run(
    { kind: "vote", pot: req.slug, actor, requestId: req.id, amount: req.amount, delayUntil: Date.now() + undoMs },
    async () => {
      // hub 1.1.0: a one-OK request is approved by one OK (ok_request), not a vote
      if (canGiveOk(req, actor)) {
        const ok = await okRequest(req)
        if (ok !== "approved" && ok !== "failed") throw new Error(ok)
        return `request:${req.id}`
      }
      const r = await vote(req, "Approve")
      if (r === "expired" || r === "decided" || r === "not_member") throw new Error(r)
      return `request:${req.id}`
    },
    { errorKey: "approve.error.vote_revert", onError: revertToast },
  )
}

export async function vote(req: Pick<RequestVM, "slug" | "id" | "proposalId" | "amount" | "receiver">, v: "Approve" | "Reject"): Promise<VoteResult> {
  return IS_LIVE ? live.vote(req, v) : store.castVote(req.slug, req.id, v)
}

export interface SpendInput {
  amount: Micro
  category: Category
  note?: string
  receiver: string
  /** pay by link (lib/client/paylink/actions.ts): the link key's public half, its date and who it's for */
  link?: { pk: string; expiresAt: number; label?: string }
  /** the request's op id (testnet), when the caller needs it before sending (with a receipt: its spendRef) */
  requestRef?: string
  /** the receipt details the person kept from "Scan receipt": their fingerprint goes into the request, then they're saved */
  receipt?: SavedReceipt
}

export interface SpendResult {
  id: number
  path: "instant" | "vote"
  payout: "sent" | "failed" | "pending" | "refused"
  /** resolves with the final payout (testnet two-phase answer); the mock is final at once */
  final: Promise<"sent" | "failed" | "pending" | "refused">
  /** the request's transaction (its receipt) */
  txHash?: string
}

/**
 * Ask to spend. With receipt details, their fingerprint is fixed first and rides in the request's request_ref
 * (OpKey + 16 hex), the details are kept on this device, and once the hub has given the request its id (for an
 * instant spend, from the relay's answer) they're saved with it in the background (lib/client/receipts/saved.ts).
 */
export async function requestSpend(slug: string, input: SpendInput): Promise<SpendResult> {
  const { receipt, ...rest } = input
  const fp = receipt ? receiptFingerprint(receipt) : undefined
  // kept on this device first: a save that doesn't make it is tried again from the spend's details
  if (receipt) keepPendingReceipt(slug, receipt)
  let r: SpendResult
  if (IS_LIVE) {
    const requestRef = rest.requestRef ?? spendRef(newOpKey(), fp)
    if (fp && receiptFingerprintOfRef(requestRef) !== shortFingerprint(fp)) throw new ActionError("bug", "receipt_ref")
    r = await live.requestSpend(slug, { ...rest, requestRef, link: rest.link ? { claimPk: rest.link.pk, expiresAtMs: rest.link.expiresAt } : undefined })
  } else {
    const m = await store.requestSpend(slug, { amountCents: toCents(rest.amount), category: rest.category, note: rest.note, receiver: rest.receiver, ...(rest.link ? { link: rest.link } : {}), ...(fp ? { fingerprint: fp } : {}) })
    const payout = m.payout === "sent" ? "sent" : "pending"
    r = { id: m.id, path: m.path, payout, final: Promise.resolve(payout), txHash: mockTxHash(`${slug}:request:${m.id}`) }
  }
  if (receipt)
    void attachReceipt(slug, r.id, receipt).then((saved) => {
      if (!saved) toast(t("details.receipt.save_failed"))
    })
  return r
}

export interface CreateInput {
  name: string
  emoji: string
  cover: number
  goalEachCents: number | null
  /** the Pot rules from the Create form; sent as preset "custom" + these rules (no templates) */
  rules: SdkRules
  invite: { pk: string; secret: string }
  /** hub 1.1.0: trust, the one-OK ceiling, the goal (always sent: explicit beats the hub's defaults) */
  extras?: RuleExtras
}

export async function createPot(input: CreateInput): Promise<string> {
  const slug = await (IS_LIVE ? live.createPot(input) : store.createPot({ ...input, extras: input.extras ? extrasRecOf(input.extras) : undefined }))
  coachTrigger(slug, "pot_created") // F-23: or after creating a Pot
  rememberEntry({ how: "created", slug, potName: input.name }) // the first-run intro's context (lib/client/onboarding.ts)
  return slug
}

export async function rotateInvite(slug: string, invite: { pk: string; secret: string }): Promise<void> {
  return IS_LIVE ? live.rotateInvite(slug, invite) : store.rotateInvite(slug, invite)
}

export type JoinResult = "joined" | "already_member" | "invalid" | "closed" | "used_up" | "expired"

/** The join machine's `joining` effect (the secret never leaves this browser). */
export async function joinPot(slug: string, secret: string): Promise<JoinResult> {
  return IS_LIVE ? live.join(slug, secret) : store.join(slug)
}

/** The join machine's `creatingSession` effect for the mock: the invitee becomes Leo (the D-61 story). */
export async function mockJoinSession(persona: PersonaId = "leo"): Promise<void> {
  return store.createSession(persona)
}

export { announce }

/** Close (P-9): propose_close + the asker's own approval; ERR_POT_BUSY / ERR_CLOSE_IN_PROGRESS come back as ActionError reasons. */
export async function proposeClose(slug: string): Promise<{ proposalId: number; status: "needs" | "approved" }> {
  return IS_LIVE ? live.proposeClose(slug) : store.proposeClose(slug)
}

export async function voteClose(slug: string, proposalId: number, v: "Approve" | "Reject"): Promise<VoteResult> {
  return IS_LIVE ? live.voteClose(slug, proposalId, v) : store.voteClose(slug, v)
}

/** Rules (P-8). Amounts in Micro; the per-person limit and instant limit are the editable values. */
export interface RulesInput {
  instantCap: Micro
  memberBudget: Micro
  /** hub 1.1.0: the extras to ask for; absent = keep the Pot's current ones */
  extras?: RuleExtras
}

type RulesPot = { slug: string; rules: { instantPayees: "members" | "members_and_allowlist"; payeeAllowlist?: string[]; expiryDays: number } }

// a change to the amounts keeps who instant payments go to (the named people included)
const toSdkRules = (pot: RulesPot, r: RulesInput): SdkRules => ({
  instantCap: r.instantCap,
  memberBudget: r.memberBudget,
  instantPayees: pot.rules.instantPayees,
  payeeAllowlist: pot.rules.instantPayees === "members" ? [] : ((pot.rules.payeeAllowlist ?? []) as SdkRules["payeeAllowlist"]),
})

const toRec = (pot: RulesPot, r: RulesInput) => ({
  instantCap: toCents(r.instantCap),
  memberBudget: toCents(r.memberBudget),
  expiryDays: pot.rules.expiryDays,
  instantPayees: pot.rules.instantPayees,
  payeeAllowlist: pot.rules.instantPayees === "members" ? [] : [...(pot.rules.payeeAllowlist ?? [])],
})


/** Several members: ask the group (propose_rules + own approval at 300 Tgas). */
export async function proposeRules(pot: RulesPot, r: RulesInput): Promise<{ proposalId: number | null; status: "needs" | "approved" }> {
  return IS_LIVE ? live.proposeRules(pot.slug, toSdkRules(pot, r), r.extras) : store.proposeRules(pot.slug, toRec(pot, r), r.extras ? extrasRecOf(r.extras) : undefined)
}

/** Sole member: the change applies at once (set_rules). */
export async function setRules(pot: RulesPot, r: RulesInput): Promise<void> {
  return IS_LIVE ? live.setRules(pot.slug, toSdkRules(pot, r), r.extras) : store.setRules(pot.slug, toRec(pot, r), r.extras ? extrasRecOf(r.extras) : undefined)
}

export async function voteRules(slug: string, proposalId: number, v: "Approve" | "Reject"): Promise<VoteResult> {
  return IS_LIVE ? live.voteRules(slug, proposalId, v) : store.voteRules(slug, v)
}

// ------------------------------------------------------------------------------------------------- hub 1.1.0

export type OkResult = "approved" | "failed" | "objection" | "decided" | "expired" | "self" | "not_one_ok" | "not_member" | "not_eligible"

/**
 * Can `me` give the one OK on this request (not the requester, not the one getting paid, no "no" yet, still waiting)?
 * Hub 1.3.0 (W4-1) also needs the OK-giver to have added ≥ $1 and to have joined before the request: the hub refuses
 * those with ERR_OK_NOT_ELIGIBLE (→ "not_eligible"), and they can still approve with the group.
 */
export function canGiveOk(r: Pick<RequestVM, "tier" | "status" | "requester" | "receiver" | "declines">, me: string | null): boolean {
  return !!me && r.tier === "one_ok" && r.status === "needs" && r.requester.id !== me && r.receiver.id !== me && r.declines.length === 0
}

/** The one OK on a one-OK request (hub ok_request; relayer R13): the hub then approves it as the rules. */
export async function okRequest(req: Pick<RequestVM, "slug" | "id" | "proposalId">): Promise<OkResult> {
  return IS_LIVE ? liveWave4.okRequest(req.slug, req.id) : store.okRequest(req.slug, req.id)
}
