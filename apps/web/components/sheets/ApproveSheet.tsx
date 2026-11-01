"use client"
// Approve sheet (ux-spec §4.10, §6.4; design-direction 02 §5a; frontend-architecture §5.4). Everything needed to
// decide fairly: who asks, how much, why it needs you, who already said yes, what's left after, when it expires.
// [Approve $300] is the sheet's one marigold; [Decline] stays secondary and expands an optional reason.
// The meter ticks optimistically (< 100 ms) and reverts with a toast if the approval didn't go through.
// A group approval gets a calm check and `approve.final`, never the burst (brand: one celebration only).
import { Check, Clock, Hourglass, X } from "lucide-react"
import { useReducer, useState } from "react"
import { createPortal } from "react-dom"
import { toast } from "sonner"
import { RequestComments } from "@/components/comments/RequestComments"
import { Bone } from "@/components/feedback/States"
import { MoneyText } from "@/components/money/MoneyText"
import { Avatar } from "@/components/pot/Avatar"
import { reasonWord } from "@/components/pot/Feed"
import { ApprovalTimeline } from "@/components/pot/RequestCard"
import { Button } from "@/components/ui/button"
import { Sheet } from "@/components/sheets/Sheet"
import { ReceiptLink } from "@/components/receipt/ReceiptLink"
import { t, tLines, type MessageKey } from "@/i18n/t"
import { announce, useOnline } from "@/lib/client/browser"
import { vote } from "@/lib/client/actions"
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
  const title = req ? t("approve.title", { name: req.requester.name, amount: formatUsd(req.amount, "whole") }) : t("approve.dialog.label")
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
      {r.status === "needs" && <p className="rounded-md bg-surface-sunken p-3 text-body text-ink">{whyText(r)}</p>}
      <ApprovalTimeline r={r} me={me} optimistic={phase.tag === "voting" && phase.v === "Approve"} />
      <dl className="flex flex-col divide-y divide-line rounded-md border border-line">
        <div className="flex min-h-12 items-center justify-between gap-3 px-3">
          <dt className="text-body-sm text-ink-muted">{t("approve.after.label")}</dt>
          <dd>
            <MoneyText micro={r.balanceAfter} className="text-ink" />
          </dd>
        </div>
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
  if (r.mine && r.status === "needs") {
    return { icon: wait, title: t("approve.own.counted", { remaining: Math.max(0, r.k - r.approvals.length) }), body: t("approve.own.hint") }
  }
  if (r.myVote && r.status === "needs" && me) {
    return { icon: ok, title: t("approve.already", { relativeTime: ago(now, now) }), body: null }
  }
  switch (r.status) {
    case "approved": {
      const [title, body] = tLines("approve.decided.approved", { amount: amountWhole, name: r.receiver.name })
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
