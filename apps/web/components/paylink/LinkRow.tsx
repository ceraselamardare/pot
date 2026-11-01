"use client"
// A pay-by-link request in the Activity feed (and "Your requests"): who sent a payment link, for what, and where the
// link is now ("Link sent · waiting to be claimed", "Claimed by Alex", "Returned to the Pot"). Tapping opens the
// request (?r=), where the requester shares the link again or cancels it. The amount reads "− $84.00" while the money
// is out of the Pot (with the link or claimed), struck through once it's back or was never sent.
import { MoneyText } from "@/components/money/MoneyText"
import { CommentCount } from "@/components/comments/RequestComments"
import { Row } from "@/components/pot/Feed"
import { ReceiptIndicator } from "@/components/receipt/ReceiptIndicator"
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

export function LinkRow({ r }: { r: RequestVM }) {
  const meId = useMe() ?? null
  const l = r.link!
  const main = linkRowText(r)
  const out = moneyLeftPot(l.status)
  return (
    <Row
      txHash={r.txHash}
      avatar={r.requester}
      onOpen={() => openRequest(r.id, r.slug)}
      main={main}
      sub={
        <>
          <span data-paylink-status={l.status}>{r.status === "needs" ? t("paylink.status.waiting") : linkStatusLine(l, meId)}</span>
          <CommentCount n={r.comments} />
          {r.hasReceipt && <ReceiptIndicator />}
        </>
      }
      chip={
        r.status === "needs" ? (
          <StatusChip status="needs">{t("approve.progress", { count: r.approvals.length, k: r.k })}</StatusChip>
        ) : (
          <LinkStatusChip status={l.status} />
        )
      }
      amount={
        out ? (
          <MoneyText micro={r.amount} sign="out" className="text-ink" />
        ) : l.status === "waiting" ? (
          <MoneyText micro={r.amount} className="text-ink" />
        ) : (
          <MoneyText micro={r.amount} strike className="text-ink-muted" />
        )
      }
    />
  )
}
