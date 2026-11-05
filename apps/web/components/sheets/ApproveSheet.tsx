"use client"
// Approve sheet (ux-spec §4.10, §6.4; design-direction 02 §5a; frontend-architecture §5.4). Everything needed to
// decide fairly: who asks, how much, who gets it (CLI-3: a member by name, anyone else by account hint and "Not in this
// Pot"), why it needs you, who already said yes, what's left after, when it expires.
// [Approve $300] is the sheet's one marigold; [Decline] stays secondary and expands an optional reason.
// The meter ticks optimistically (< 100 ms) and reverts with a toast if the approval didn't go through.
// A group approval gets a calm check and `approve.final`, never the burst (brand: one celebration only).
// It is also every spend's details sheet (2026-11-02): instant spends, decided requests and links open it too, from
// the feed, a person's activity, Requests and You. It says how the spend was approved (the Pot's rules / one OK by
// X / the group) and where it is, links its explorer receipt, holds the comments, and shows the receipt details saved
// with it (members only) with the fingerprint check (components/receipt/SavedReceipt.tsx).
import { Check, Clock, Hand, Hourglass, X } from "lucide-react"
import { useReducer, useState } from "react"
import { createPortal } from "react-dom"
import { toast } from "sonner"
import { RequestComments } from "@/components/comments/RequestComments"
import { LinkPanel } from "@/components/paylink/LinkPanel"
import { Bone } from "@/components/feedback/States"
import { MoneyText } from "@/components/money/MoneyText"
import { Avatar } from "@/components/pot/Avatar"
import { reasonWord } from "@/components/pot/Feed"
import { ApprovalTimeline } from "@/components/pot/RequestCard"
import { Button } from "@/components/ui/button"
import { Sheet } from "@/components/sheets/Sheet"
import { ApproveReceiver } from "@/components/sheets/ApproveReceiver"
import { ReceiptLink } from "@/components/receipt/ReceiptLink"
import { SpendReceiptSection } from "@/components/receipt/SavedReceipt"
import { RecordStatusChip } from "@/components/record/RecordStatusChip"
import { approvedByOf, approvedWords, recordStatusOf } from "@/lib/client/record"
import { t, tLines, type MessageKey } from "@/i18n/t"
import { announce, useOnline } from "@/lib/client/browser"
import { canGiveOk, okRequest, vote } from "@/lib/client/actions"
import { useRequest } from "@/lib/client/data"
import { ActionError } from "@/lib/client/errors"
import type { PotVM, RequestVM } from "@/lib/client/mock/types"
import { formatUsd } from "@/lib/client/money"
import { ago, formatDate, useNow } from "@/lib/client/time"
import { inWords } from "@/components/pot/Feed"

type Phase =
  | { tag: "ready" }
  | { tag: "declining" }
  | { tag: "voting"; v: "Approve" | "Reject" }
  | { tag: "done"; key: MessageKey; vars: Record<string, string | number>; tone: "approved" | "declined" | "neutral" }

type PhaseEvent = { type: "set"; phase: Phase } | { type: "reset" }
const phaseReducer = (_: Phase, e: PhaseEvent): Phase => (e.type === "reset" ? { tag: "ready" } : e.phase)

const WHY: Record<RequestVM["reason"], MessageKey> = {
  ok: "approve.why.cap",
  over_cap: "approve.why.cap",
  over_budget: "approve.why.budget",
  recipient: "approve.why.recipient",
  new_member: "approve.why.new_member",
}

export function ApproveSheet({ pot, requestId, onClose }: { pot: PotVM; requestId: number | null; onClose: () => void }) {
  const open = requestId !== null
  // keep showing the last request while the sheet animates out
  const [lastId, setLastId] = useState(requestId)
  const [actions, setActions] = useState<HTMLDivElement | null>(null)
  if (requestId !== null && requestId !== lastId) setLastId(requestId)
  const r = useRequest(pot.slug, requestId ?? lastId)
  const req = r ?? null
  // "Sam asks for $300" while it waits, "Sam asked for $300" once decided; fixed for the sheet's life, so approving
  // in it doesn't rename the open dialog
  const [asked, setAsked] = useState<{ id: number; waiting: boolean } | null>(null)
  const [wasOpen, setWasOpen] = useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) setAsked(null) // a new opening reads the status afresh
  }
  if (req && (asked === null || asked.id !== req.id)) setAsked({ id: req.id, waiting: req.status === "needs" })
  const waiting = asked && req && asked.id === req.id ? asked.waiting : req?.status === "needs"
  const title = req
    ? t(waiting ? "approve.title" : "details.title", { name: req.requester.name, amount: formatUsd(req.amount, "whole") })
    : t("details.dialog.label")
  return (
    // the decision buttons live in the sheet's footer (outside the scrolling body, so the comment thread at the end of
    // the body is never under them); ApproveBody portals them there to keep its own state
    <Sheet open={open} onClose={onClose} title={title} label={title} footer={req ? <div ref={setActions} className="flex flex-col gap-2" data-approve-actions /> : undefined}>
      {r === undefined ? (
        <div className="flex flex-col gap-3 pt-2" aria-hidden>
          <Bone className="h-11 w-40" />
          <Bone className="h-4 w-56" />
          <Bone className="h-24 w-full rounded-md" />
        </div>
      ) : req ? (
        <ApproveBody key={req.id} pot={pot} r={req} onClose={onClose} actions={actions} />
      ) : (
        <p className="py-6 text-body text-ink-muted">{t("approve.not_found")}</p>
      )}
    </Sheet>
  )
}

function ApproveBody({ pot, r, onClose, actions }: { pot: PotVM; r: RequestVM; onClose: () => void; actions: HTMLElement | null }) {
  const now = useNow()
  const online = useOnline()
  const me = pot.me?.person.id ?? null
  const [phase, dispatch] = useReducer(phaseReducer, { tag: "ready" })
  const [reason, setReason] = useState("")
  const amountWhole = formatUsd(r.amount, "whole")
  const canDecide = r.status === "needs" && !r.mine && !r.myVote && phase.tag !== "done"
  // hub 1.1.0 one-OK tier: one OK from anyone but the requester approves it (ok_request, not a vote); after a "no"
  // (an objection) the group decides by majority as before
  const oneOk = r.tier === "one_ok"
  const okPath = canDecide && canGiveOk(r, me)

  const giveOk = async () => {
    if (!online) return toast(t("approve.offline"))
    dispatch({ type: "set", phase: { tag: "voting", v: "Approve" } })
    try {
      const res = await okRequest(r)
      if (res === "approved") {
        const vars = { amount: amountWhole, name: r.receiver.name }
        announce(t("approve.ok.done", vars))
        dispatch({ type: "set", phase: { tag: "done", key: "approve.ok.done", vars, tone: "approved" } })
      } else if (res === "failed") {
        const vars = { amount: amountWhole }
        announce(t("approve.ok.failed", vars))
        dispatch({ type: "set", phase: { tag: "done", key: "approve.ok.failed", vars, tone: "neutral" } })
      } else if (res === "objection") {
        const vars = { k: r.k, n: r.n }
        announce(t("approve.ok.objection", vars))
        dispatch({ type: "set", phase: { tag: "done", key: "approve.ok.objection", vars, tone: "neutral" } })
      } else if (res === "not_eligible") {
        // hub 1.3.0 (W4-1): only someone who added money before the request (and isn't paid by it) can give the one OK
        announce(t("approve.ok.not_eligible"))
        dispatch({ type: "set", phase: { tag: "done", key: "approve.ok.not_eligible", vars: {}, tone: "neutral" } })
      } else {
        dispatch({ type: "set", phase: { tag: "done", key: "approve.decided.declined", vars: {}, tone: "neutral" } })
      }
    } catch (e) {
      dispatch({ type: "reset" })
      toast.error(t(e instanceof ActionError && (e.cls === "relayer_down" || e.cls === "rate_limited") ? "approve.error.relayer" : "approve.ok.error"))
    }
  }

  const cast = async (v: "Approve" | "Reject") => {
    if (!online) return toast(t("approve.offline"))
    dispatch({ type: "set", phase: { tag: "voting", v } })
    if (v === "Approve") announce(t("approve.optimistic", { count: r.approvals.length + 1, k: r.k }))
    try {
      const res = await vote(r, v)
      if (res === "approved") {
        const vars = { amount: amountWhole, name: r.receiver.name }
        announce(t("approve.final", vars))
        dispatch({ type: "set", phase: { tag: "done", key: "approve.final", vars, tone: "approved" } })
      } else if (res === "counted" && v === "Approve") {
        dispatch({
          type: "set",
          phase: { tag: "done", key: "approve.optimistic", vars: { count: r.approvals.length + 1, k: r.k }, tone: "approved" },
        })
      } else if (res === "counted" || res === "declined") {
        const vars = { name: r.requester.name }
        announce(t("approve.declined.self", vars))
        dispatch({ type: "set", phase: { tag: "done", key: "approve.declined.self", vars, tone: "declined" } })
      } else if (res === "expired") {
        dispatch({ type: "set", phase: { tag: "done", key: "approve.decided.declined", vars: {}, tone: "neutral" } })
      } else if (res === "already") {
        dispatch({ type: "set", phase: { tag: "done", key: "approve.already", vars: { relativeTime: ago(now, now) }, tone: "neutral" } })
      } else {
        dispatch({ type: "set", phase: { tag: "done", key: "approve.decided.declined", vars: {}, tone: "neutral" } })
      }
    } catch (e) {
      dispatch({ type: "reset" })
      toast.error(t(e instanceof ActionError && (e.cls === "relayer_down" || e.cls === "rate_limited") ? "approve.error.relayer" : "approve.error.vote_revert"))
    }
  }

  const status = statusLine(r, phase, now, me)
  return (
    <div className="flex flex-col gap-5 pt-1" data-approve={r.id}>
      <div className="flex items-center gap-3">
        <Avatar person={r.requester} size="md" />
        <p className="text-body-sm text-ink-muted">{t("approve.meta", { potName: r.potName, time: ago(r.createdAt, now) })}</p>
      </div>
      <div>
        <MoneyText micro={r.amount} variant="hero" className="text-ink" strike={r.status === "declined" || r.status === "expired"} />
        <p className="mt-1 text-body text-ink">{t("approve.reason", { reason: reasonWord(r) })}</p>
      </div>
      {/* CLI-3 (security audit 2026-11-04): who gets the money, before anyone approves */}
      <ApproveReceiver pot={pot} r={r} me={me} />
      {r.status === "needs" && <p className="rounded-md bg-surface-sunken p-3 text-body text-ink">{oneOk && r.declines.length === 0 ? t("approve.why.one_ok", { name: r.requester.name }) : whyText(r)}</p>}
      {oneOk && r.declines.length === 0 && r.status === "needs" ? (
        <OneOkLine r={r} potName={pot.name} />
      ) : r.path === "instant" ? null : (
        // an instant spend had no one to ask: the Pot's rules approved it (the status line and "Approved" say so)
        <ApprovalTimeline r={r} me={me} optimistic={phase.tag === "voting" && phase.v === "Approve"} />
      )}
      {/* pay by link (hub 1.1.0): where the link is; the requester shares it again or cancels it */}
      {r.link && <LinkPanel pot={pot} r={r} />}
      <dl className="flex flex-col divide-y divide-line rounded-md border border-line" data-details-facts>
        <div className="flex min-h-12 items-center justify-between gap-3 px-3 py-1.5">
          <dt className="text-body-sm text-ink-muted">{t("details.status.label")}</dt>
          <dd>
            <RecordStatusChip s={recordStatusOf(r)} />
          </dd>
        </div>
        <div className="flex min-h-12 items-center justify-between gap-3 px-3 py-1.5">
          <dt className="text-body-sm text-ink-muted">{t("details.approved.label")}</dt>
          <dd className="text-right text-label text-ink" data-details-approved>
            {approvedWords({ approvedBy: approvedByOf(r), okBy: r.okBy ?? null })}
          </dd>
        </div>
        {r.status === "needs" && (
          <div className="flex min-h-12 items-center justify-between gap-3 px-3">
            <dt className="text-body-sm text-ink-muted">{t("approve.after.label")}</dt>
            <dd>
              <MoneyText micro={r.balanceAfter} className="text-ink" />
            </dd>
          </div>
        )}
        {r.status === "needs" && (
          <div className="flex min-h-12 items-center justify-between gap-3 px-3">
            <dt className="text-body-sm text-ink-muted">{t("approve.expires.label")}</dt>
            <dd className="text-label text-ink">{inWords(r.expiresAt, now)}</dd>
          </div>
        )}
      </dl>
      {/* the request's own transaction: a quiet receipt, never a button */}
      <ReceiptLink txHash={r.txHash} what={t("feed.pending", { name: r.requester.name, amount: amountWhole, reason: reasonWord(r) })} className="-mt-2 self-start" />

      {status && (
        <div className="flex items-start gap-3 rounded-md bg-surface-sunken p-3" data-approve-status>
          <span className="mt-0.5 shrink-0">{status.icon}</span>
          <div>
            <p className="text-label text-ink">{status.title}</p>
            {status.body && <p className="mt-0.5 text-body-sm text-ink-muted">{status.body}</p>}
          </div>
        </div>
      )}

      {canDecide && phase.tag === "declining" && (
        <label className="flex flex-col gap-1.5">
          <span className="text-body-sm text-ink-muted">{t("approve.decline.reason")}</span>
          <textarea
            value={reason}
            maxLength={140}
            rows={2}
            onChange={(e) => setReason(e.target.value)}
            className="rounded-sm border border-line-strong bg-surface-sunken p-3 text-body text-ink"
          />
        </label>
      )}

      {/* the receipt details saved with the spend (members only) and the fingerprint check */}
      <SpendReceiptSection pot={pot} r={r} />

      {/* the group's thread about this spend (off-chain); its [Send] is secondary, so Approve stays the one marigold */}
      <RequestComments pot={pot} r={r} />

      {actions &&
        createPortal(
          <>
            {canDecide && phase.tag === "declining" ? (
              <>
                <Button className="w-full" onClick={() => cast("Reject")}>
                  {t("approve.decline.confirm")}
                </Button>
                <Button variant="ghost" className="w-full" onClick={() => dispatch({ type: "reset" })}>
                  {t("approve.decline.cancel")}
                </Button>
              </>
            ) : okPath ? (
              <>
                {!online && <p className="text-body-sm text-ink-muted">{t("approve.offline")}</p>}
                <Button
                  variant="primary"
                  className="w-full"
                  aria-disabled={!online || undefined}
                  disabled={phase.tag === "voting"}
                  aria-busy={phase.tag === "voting" || undefined}
                  onClick={giveOk}
                  data-ok-cta
                >
                  {phase.tag === "voting" ? t("approve.cta.oking") : t("approve.cta.ok", { amount: amountWhole })}
                </Button>
                <Button className="w-full" disabled={phase.tag === "voting"} onClick={() => dispatch({ type: "set", phase: { tag: "declining" } })}>
                  {t("approve.cta.decline")}
                </Button>
              </>
            ) : canDecide ? (
              <>
                {!online && <p className="text-body-sm text-ink-muted">{t("approve.offline")}</p>}
                <Button
                  variant="primary"
                  className="w-full"
                  aria-disabled={!online || undefined}
                  disabled={phase.tag === "voting"}
                  aria-busy={phase.tag === "voting" || undefined}
                  onClick={() => cast("Approve")}
                >
                  {phase.tag === "voting" && phase.v === "Approve" ? t("approve.cta.approving") : t("approve.cta.approve", { amount: amountWhole })}
                </Button>
                <Button className="w-full" disabled={phase.tag === "voting"} onClick={() => dispatch({ type: "set", phase: { tag: "declining" } })}>
                  {t("approve.cta.decline")}
                </Button>
              </>
            ) : (
              <Button variant={phase.tag === "done" ? "primary" : "secondary"} className="w-full" onClick={onClose}>
                {t("spend.done")}
              </Button>
            )}
          </>,
          actions,
        )}
    </div>
  )
}

function whyText(r: RequestVM): string {
  const key = WHY[r.reason]
  if (key === "approve.why.budget") return t(key, { memberBudget: formatUsd(r.memberBudget, "whole"), name: r.requester.name })
  if (key === "approve.why.new_member") return t(key, { name: r.requester.name })
  if (key === "approve.why.recipient") return t(key)
  return t("approve.why.cap", { instantLimit: formatUsd(r.instantCap, "whole") })
}

function statusLine(r: RequestVM, phase: Phase, now: number, me: string | null) {
  const amountWhole = formatUsd(r.amount, "whole")
  const ok = <Check aria-hidden className="size-5 text-approved" strokeWidth={2.5} />
  const no = <X aria-hidden className="size-5 text-declined" strokeWidth={2.5} />
  const wait = <Clock aria-hidden className="size-5 text-waiting" strokeWidth={2.25} />
  if (phase.tag === "done") {
    const [title, body] = splitLine(t(phase.key, phase.vars as never))
    return { icon: phase.tone === "approved" ? ok : phase.tone === "declined" ? no : wait, title, body }
  }
  if (r.mine && r.status === "needs" && r.tier === "one_ok" && r.declines.length === 0) {
    const [title, body] = tLines("approve.ok.own")
    return { icon: <Hand aria-hidden className="size-5 text-waiting" strokeWidth={2.25} />, title, body }
  }
  if (r.tier === "one_ok" && r.status === "needs" && r.declines.length > 0) {
    const [title, body] = tLines("approve.ok.objection", { k: r.k, n: r.n })
    return { icon: wait, title, body }
  }
  if (r.mine && r.status === "needs") {
    return { icon: wait, title: t("approve.own.counted", { remaining: Math.max(0, r.k - r.approvals.length) }), body: t("approve.own.hint") }
  }
  if (r.myVote && r.status === "needs" && me) {
    return { icon: ok, title: t("approve.already", { relativeTime: ago(now, now) }), body: null }
  }
  switch (r.status) {
    case "instant": {
      const [title, body] = r.receiver.id === me ? tLines("details.instant.you", { amount: amountWhole }) : tLines("details.instant", { amount: amountWhole, name: r.receiver.name })
      return { icon: ok, title, body }
    }
    case "approved": {
      const [title, body] = r.okBy
        ? tLines("approve.decided.ok", { okName: r.okBy.id === me ? t("feed.you") : r.okBy.name, amount: amountWhole, name: r.receiver.name })
        : tLines("approve.decided.approved", { amount: amountWhole, name: r.receiver.name })
      return { icon: ok, title, body }
    }
    case "declined": {
      const [title, body] = tLines("approve.decided.declined")
      return { icon: no, title, body }
    }
    case "expired": {
      const [title, body] = tLines("approve.expired", { k: r.k, date: formatDate(r.expiresAt), name: r.requester.name })
      return { icon: <Hourglass aria-hidden className="size-5 text-ink-muted" strokeWidth={2.25} />, title, body }
    }
    case "failed": {
      const [title, body] = tLines("approve.failed", { amount: amountWhole })
      return { icon: no, title, body }
    }
    default:
      return null
  }
}

function splitLine(s: string): [string, string | null] {
  const i = s.indexOf(" · ")
  return i < 0 ? [s, null] : [s.slice(0, i), s.slice(i + 3)]
}

/** hub 1.1.0: who can approve a one-OK request (anyone but the requester), in place of the k-of-n timeline. */
function OneOkLine({ r, potName }: { r: RequestVM; potName: string }) {
  return (
    <section aria-labelledby={`one-ok-${r.id}`} className="flex flex-col gap-2" data-one-ok>
      <h3 id={`one-ok-${r.id}`} className="text-label text-ink">
        {t("approve.one_ok.header")}
      </h3>
      <p className="flex items-center gap-3 text-body-sm text-ink">
        <span className="grid size-6 place-items-center rounded-pill bg-approved text-surface">
          <Check aria-hidden className="size-4" strokeWidth={3} />
        </span>
        <Avatar person={r.requester} size="xs" />
        {t("approve.timeline.asked", { name: r.requester.name })}
      </p>
      <p className="flex items-center gap-3 text-body-sm text-ink-muted">
        <span className="grid size-6 place-items-center">
          <Hand aria-hidden className="size-5 text-waiting" strokeWidth={2.25} />
        </span>
        {t("approve.one_ok.who", { potName, name: r.requester.name })}
      </p>
    </section>
  )
}
