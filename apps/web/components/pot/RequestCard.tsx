"use client"
// RequestCard + ApprovalTimeline (ux-spec §3, §6.4; design-direction 02 §2.4, §5a).
// Inline [Approve $300] and [Decline] are SECONDARY buttons (the Pot's one marigold is Add money; the marigold
// Approve lives in the Approve sheet). With a device key (no popup) Approve flips the card to
// "Approved · Undo" for 4 s and sends nothing until the window ends (WCAG 3.3.4). Decline opens the sheet,
// where the optional reason lives. The sentence button opens the sheet for review.
import { Check } from "lucide-react"
import { CommentCount } from "@/components/comments/RequestComments"
import { ReceiptIndicator } from "@/components/receipt/ReceiptIndicator"
import { Avatar } from "@/components/pot/Avatar"
import { StatusChip } from "@/components/pot/StatusChip"
import { MoneyText } from "@/components/money/MoneyText"
import { Button } from "@/components/ui/button"
import { reasonWord, inWords } from "@/components/pot/Feed"
import { t } from "@/i18n/t"
import { announce } from "@/lib/client/browser"
import { approveInline, canGiveOk } from "@/lib/client/actions"
import { formatUsd } from "@/lib/client/money"
import type { RequestVM } from "@/lib/client/mock/types"
import { ops as opsStore, useOps } from "@/lib/client/ops/store"
import { openRequest } from "@/lib/client/sheet"

export function RequestCard({
  r,
  me,
  now,
  showPot,
  needsGesture = false,
}: {
  r: RequestVM
  me: string
  now: number
  showPot?: boolean
  /** true when signing needs a popup (NEAR Auth without a device key): show [Review] instead (ux-spec 6.4 B) */
  needsGesture?: boolean
}) {
  const ops = useOps()
  const op = ops.find((o) => o.kind === "vote" && o.pot === r.slug && o.requestId === r.id && o.status !== "cancelled")
  const amountWhole = formatUsd(r.amount, "whole")
  // hub 1.1.0: a one-OK request takes one OK from anyone but the requester (approveInline sends ok_request)
  const ok = canGiveOk(r, me)
  const approveLabel = ok ? t("approve.cta.ok", { amount: amountWhole }) : t("approve.cta.approve", { amount: amountWhole })
  const approve = () => {
    const h = approveInline(r, me)
    if (h) announce(t("approve.undo.label"))
    void h?.done.then((res) => {
      if (res === "ok") announce(t("approve.optimistic", { count: r.approvals.length + 1, k: r.k }))
    })
  }
  const undo = () => {
    if (op) opsStore.cancel(op.id)
  }
  return (
    <article
      aria-label={t("approve.title", { name: r.requester.name, amount: amountWhole })}
      className="pot-enter rounded-md border border-line bg-surface p-3 shadow-card"
      data-request-card={r.id}
    >
      {showPot && (
        <p className="mb-2 flex items-center gap-1.5 text-body-sm text-ink-muted">
          <span aria-hidden>{r.potEmoji}</span>
          {r.potName}
        </p>
      )}
      <button type="button" onClick={() => openRequest(r.id, r.slug)} className="-m-1 flex w-[calc(100%+0.5rem)] items-start gap-3 rounded-sm p-1 text-left hover:bg-surface-sunken">
        <Avatar person={r.requester} size="sm" ring="surface" className="mt-0.5" />
        <span className="min-w-0 flex-1">
          <span className="block text-body text-ink">
            {t("feed.pending", { name: r.requester.name, amount: amountWhole, reason: reasonWord(r) })}
          </span>
          <span className="mt-2 flex flex-wrap items-center gap-2">
            <StatusChip status="needs">{r.tier === "one_ok" && r.declines.length === 0 ? t("feed.pending.one_ok") : t("approve.progress", { count: r.approvals.length, k: r.k })}</StatusChip>
            <span className="text-body-sm text-ink-muted">{t("approve.expires", { relativeTime: inWords(r.expiresAt, now) })}</span>
            <CommentCount n={r.comments} />
            {r.hasReceipt && <ReceiptIndicator className="text-body-sm text-ink-muted" />}
          </span>
        </span>
        <MoneyText micro={r.amount} className="pt-0.5 text-ink" />
      </button>

      {op ? (
        <div className="relative mt-3 overflow-hidden rounded-sm bg-surface-sunken" aria-live="polite">
          <div className="flex min-h-12 items-center gap-2 pr-1 pl-3">
            {op.status === "queued" ? (
              <>
                <Check aria-hidden className="size-5 text-approved" strokeWidth={2.5} />
                <span className="flex-1 text-label text-ink">{t("approve.undo.label")}</span>
                <Button size="sm" variant="ghost" onClick={undo} className="text-link underline-offset-4 hover:underline">
                  {t("approve.undo.cta")}
                </Button>
              </>
            ) : (
              <StatusChip status={op.status === "confirmed" ? "sent" : "sending"} className="bg-transparent px-0" />
            )}
          </div>
          {op.status === "queued" && <span aria-hidden className="pot-drain absolute bottom-0 left-0 h-0.5 w-full bg-approved" />}
        </div>
      ) : needsGesture ? (
        <div className="mt-3">
          <Button className="w-full" onClick={() => openRequest(r.id, r.slug)}>
            {t("approve.cta.review")}
          </Button>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button onClick={approve} aria-label={approveLabel} data-inline-ok={ok || undefined}>
            <Check aria-hidden strokeWidth={2.25} />
            {approveLabel}
          </Button>
          <Button onClick={() => openRequest(r.id, r.slug)}>{t("approve.cta.decline")}</Button>
        </div>
      )}
    </article>
  )
}

export { ApprovalTimeline, type TimelineSubject } from "@/components/pot/ApprovalTimeline"
