"use client"
// A pay-by-link request in the Activity feed (and Requests): the compact row (CompactRow) with a link badge on the
// requester's avatar, "Maya · Food", and where the link is now as a short chip ("Link sent", "Claimed",
// "Returned"…). Tapping opens the request (?r=), where the requester shares the link again or cancels it, and where
// the long words live ("Claimed by Alex", "Nobody took it in time · Returned to the Pot"); the row's name carries
// them too. The amount reads "− $84.00" while the money is out of the Pot (with the link or claimed), struck through
// once it's back or was never sent (the chip says which: "Returned", "Not sent").
import { Link2 } from "lucide-react"
import { MoneyText } from "@/components/money/MoneyText"
import { CommentMark, CompactRow, LeadAvatar, ReceiptMark, reasonTitle, rowLabel, rowWhen, RowTitle } from "@/components/pot/CompactRow"
import { StatusChip } from "@/components/pot/StatusChip"
import { t } from "@/i18n/t"
import type { Category, RequestVM } from "@/lib/client/mock/types"
import { formatUsd } from "@/lib/client/money"
import { moneyLeftPot } from "@/lib/client/paylink/link"
import { openRequest } from "@/lib/client/sheet"
import { useMe } from "@/lib/client/session"
import { LinkStatusChip, linkStatusLine } from "./LinkStatus"

const reasonOf = (r: Pick<RequestVM, "category" | "note">) => r.note?.trim() || t(`spend.reason.word.${r.category}` as `spend.reason.word.${Category}`)

/** The row's sentence: "Maya sent Casa Lisboa host a $84 payment link for a place to stay". */
export function linkRowText(r: RequestVM): string {
  const vars = { name: r.requester.name, amount: formatUsd(r.amount, "whole"), reason: reasonOf(r) }
  if (r.status === "needs") return t("paylink.feed.pending", vars)
  return r.link?.label ? t("paylink.feed.sent_to", { ...vars, who: r.link.label }) : t("paylink.feed.sent", vars)
}

export function LinkRow({ r, now = 0, at, showPot }: { r: RequestVM; now?: number; at?: number; showPot?: boolean }) {
  const meId = useMe() ?? null
  const l = r.link!
  const out = moneyLeftPot(l.status)
  const waiting = r.status === "needs"
  const where = waiting ? t("paylink.status.waiting") : linkStatusLine(l, meId)
  const when = rowWhen(at ?? r.decidedAt ?? r.createdAt, now)
  const pot = showPot ? { emoji: r.potEmoji, name: r.potName } : undefined
  return (
    <CompactRow
      onOpen={() => openRequest(r.id, r.slug)}
      label={rowLabel([
        linkRowText(r),
        where,
        waiting && t("approve.progress", { count: r.approvals.length, k: r.k }),
        pot?.name,
        r.hasReceipt && t("details.receipt.indicator"),
        !!r.comments && t("comments.count", { n: r.comments }),
        when.long,
      ])}
      lead={<LeadAvatar person={r.requester} badge={Link2} />}
      title={<RowTitle who={showPot ? undefined : r.requester.name} what={reasonTitle(r)} pot={pot} />}
      meta={
        <>
          {waiting ? (
            <StatusChip size="sm" status="needs">
              {t("row.status.waiting", { count: r.approvals.length, k: r.k })}
            </StatusChip>
          ) : (
            <LinkStatusChip size="sm" status={l.status} short />
          )}
          {r.hasReceipt && <ReceiptMark />}
          <CommentMark n={r.comments} />
        </>
      }
      aside={when.short}
      amount={
        out ? (
          <MoneyText micro={r.amount} sign="out" className="text-ink" />
        ) : l.status === "waiting" ? (
          <MoneyText micro={r.amount} className="text-ink" />
        ) : (
          <MoneyText micro={r.amount} strike className="text-ink-muted" />
        )
      }
      data-request-row={r.id}
      data-paylink-status={l.status}
    />
  )
}
