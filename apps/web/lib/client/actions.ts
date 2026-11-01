"use client"
// Money actions = intent → sign → relay → pending op (frontend-architecture §3.4, §6), one implementation per
// data source: the mock store (deterministic latencies, fault injection) or live (lib/client/live/actions.ts:
// device-key delegates / demo intents through POST /api/relay, settled at the relay's block). Every action:
//  - refuses while offline (ops are never queued offline; the caller shows `*.offline`),
//  - shows an optimistic item at once ("Sending…"),
//  - on failure reverts it and shows ONE toast with the flow's copy key (what happened, whether money moved,
//    what to do), and on success one announcement or toast, never both (WCAG 4.1.3).
import { toast } from "sonner"
import { t, type MessageKey } from "@/i18n/t"
import { announce, isOnline } from "./browser"
import { IS_LIVE } from "./config"
import { ActionError, isTransportError } from "./errors"
import { formatUsd, toCents, type Micro } from "./money"
import * as store from "./mock/store"
import type { Category, RequestVM } from "./mock/types"
import type { PersonaId } from "./mock/fixtures"
import { ops, type OpHandle } from "./ops/store"
import { coachTrigger } from "./pwa/coach"
import * as live from "./live/actions"

function revertToast(key: MessageKey) {
  toast.error(t(key as "generic.error"))
}

const errorKeyOf = (e: unknown, relayer: MessageKey, generic: MessageKey): MessageKey => {
  if (e instanceof ActionError && e.cls === "rate_limited") return "relayer.cap"
  return isTransportError(e) ? relayer : generic
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
      if (!IS_LIVE) return void (await store.addMoney(pot.slug, toCents(amount)))
      try {
        return await live.addMoney(pot.slug, amount, opts)
      } catch (e) {
        errorKey = errorKeyOf(e, "add.error.relayer", "add.error.generic")
        throw e
      }
    },
    {
      errorKey: "add.error.relayer",
      onError: () => revertToast(errorKey),
      onSuccess: () => {
        toast.success(t("add.success", { potName: pot.name, balance: formatUsd(pot.balance + amount) }))
        coachTrigger(pot.slug, "contribution") // F-23: install is earned after the first contribution
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
}

export interface SpendResult {
  id: number
  path: "instant" | "vote"
  payout: "sent" | "failed" | "pending" | "refused"
  /** resolves with the final payout (testnet two-phase answer); the mock is final at once */
  final: Promise<"sent" | "failed" | "pending" | "refused">
}

export async function requestSpend(slug: string, input: SpendInput): Promise<SpendResult> {
  if (IS_LIVE) return live.requestSpend(slug, input)
  const r = await store.requestSpend(slug, { amountCents: toCents(input.amount), category: input.category, note: input.note, receiver: input.receiver })
  const payout = r.payout === "sent" ? "sent" : "pending"
  return { id: r.id, path: r.path, payout, final: Promise.resolve(payout) }
}

export interface CreateInput {
  name: string
  emoji: string
  cover: number
  goalEachCents: number | null
  invite: { pk: string; secret: string }
}

export async function createPot(input: CreateInput): Promise<string> {
  const slug = await (IS_LIVE ? live.createPot(input) : store.createPot(input))
  coachTrigger(slug, "pot_created") // F-23: or after creating a Pot
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
}

const toSdkRules = (pot: { rules: { instantPayees: "members" | "members_and_allowlist" } }, r: RulesInput) => ({
  instantCap: r.instantCap,
  memberBudget: r.memberBudget,
  instantPayees: pot.rules.instantPayees,
  payeeAllowlist: [] as never[],
})

const toRec = (pot: { rules: { expiryDays: number } }, r: RulesInput) => ({
  instantCap: toCents(r.instantCap),
  memberBudget: toCents(r.memberBudget),
  expiryDays: pot.rules.expiryDays,
})

type RulesPot = { slug: string; rules: { instantPayees: "members" | "members_and_allowlist"; expiryDays: number } }

/** Several members: ask the group (propose_rules + own approval at 300 Tgas). */
export async function proposeRules(pot: RulesPot, r: RulesInput): Promise<{ proposalId: number | null; status: "needs" | "approved" }> {
  return IS_LIVE ? live.proposeRules(pot.slug, toSdkRules(pot, r)) : store.proposeRules(pot.slug, toRec(pot, r))
}

/** Sole member: the change applies at once (set_rules). */
export async function setRules(pot: RulesPot, r: RulesInput): Promise<void> {
  return IS_LIVE ? live.setRules(pot.slug, toSdkRules(pot, r)) : store.setRules(pot.slug, toRec(pot, r))
}

export async function voteRules(slug: string, proposalId: number, v: "Approve" | "Reject"): Promise<VoteResult> {
  return IS_LIVE ? live.voteRules(slug, proposalId, v) : store.voteRules(slug, v)
}
