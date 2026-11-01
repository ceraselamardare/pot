"use client"
// The receipt details saved with a spend, in the spend's details sheet (lib/receipt-saved.ts; members only):
//  - one card: merchant · day and the total; "Converted from €42.50 at 1.0852 (Oct 30)" for another currency (the
//    dollars are the spend's own amount); the items behind "Show 3 items" with tax and tip; "Read privately" with
//    the "Check it yourself ↗" link when the reading carries its proof;
//  - the fingerprint check, recomputed here from what is shown and compared with the one the spend itself carries:
//    "Receipt fingerprint matches" (icon + word) or a warning that the details changed, with a plain "How does this
//    work?" behind a disclosure;
// Never marigold, never the photo. Status always comes as an icon and a word.
import { ArrowUpRight, ChevronDown, CircleHelp, ReceiptText, ShieldCheck, TriangleAlert } from "lucide-react"
import { useEffect, useId, useState } from "react"
import { Bone } from "@/components/feedback/States"
import { t, tLines } from "@/i18n/t"
import { cn } from "@/lib/client/cn"
import type { PotVM, RequestVM } from "@/lib/client/mock/types"
import { retryPendingReceipt, pendingReceiptFor, useSavedReceipt } from "@/lib/client/receipts/saved"
import { formatReceiptMoney, receiptDay } from "@/lib/receipt"
import type { FingerprintStatus, SavedReceipt } from "@/lib/receipt-saved"

/** "€42.50 at 1.0852 (Oct 30)": what was printed, the rate used and its day. */
export function convertedLine(r: SavedReceipt): string | null {
  if (!r.fx) return null
  return t("details.receipt.converted", { original: formatReceiptMoney(r.fx.amountCents, r.fx.from), rate: r.fx.rate, day: receiptDay(r.fx.rateDate) })
}

/** The receipt section of a spend's details: the saved details (members), or why there are none. */
export function SpendReceiptSection({ pot, r }: { pot: PotVM; r: RequestVM }) {
  const saved = useSavedReceipt(pot, r)
  // my own spend whose details are still on this device (the save after sending didn't make it): try again now
  const pending = r.mine && !r.hasReceipt && !!pendingReceiptFor(r.slug, r.fingerprint)
  const [failed, setFailed] = useState(false)
  const { slug, id, fingerprint, hasReceipt, mine } = r
  const retry = () => {
    setFailed(false)
    void retryPendingReceipt(slug, { id, fingerprint, hasReceipt, mine }).then((ok) => setFailed(!ok))
  }
  useEffect(() => {
    if (!pending) return
    let live = true
    void retryPendingReceipt(slug, { id, fingerprint, hasReceipt, mine }).then((ok) => {
      if (live) setFailed(!ok)
    })
    return () => {
      live = false
    }
  }, [pending, slug, id, fingerprint, hasReceipt, mine])

  if (saved.state === "ready") return <SavedReceiptCard receipt={saved.receipt} check={saved.check} />
  if (saved.state === "loading")
    return (
      <div className="flex flex-col gap-2" aria-busy="true" data-saved-receipt="loading">
        <span className="sr-only">{t("details.receipt.loading")}</span>
        <Bone className="h-12 w-full rounded-md" />
      </div>
    )
  if (saved.state === "error")
    return (
      <p className="flex flex-wrap items-center gap-x-2 text-body-sm text-ink-muted" data-saved-receipt="error">
        {t("details.receipt.error")}
        <button type="button" onClick={saved.retry} className="min-h-11 rounded-sm px-1 text-link underline-offset-4 hover:underline">
          {t("details.receipt.retry")}
        </button>
      </p>
    )
  if (pending)
    return failed ? (
      <p className="flex flex-wrap items-center gap-x-2 text-body-sm text-ink-muted" data-saved-receipt="unsaved">
        <ReceiptText aria-hidden className="size-4 shrink-0" strokeWidth={2} />
        {t("details.receipt.unsaved")}
        <button type="button" onClick={retry} className="min-h-11 rounded-sm px-1 text-link underline-offset-4 hover:underline">
          {t("details.receipt.retry")}
        </button>
      </p>
    ) : (
      <p className="flex items-center gap-2 text-body-sm text-ink-muted" role="status" data-saved-receipt="saving">
        <ReceiptText aria-hidden className="size-4 shrink-0" strokeWidth={2} />
        {t("details.receipt.saving")}
      </p>
    )
  // the spend carries a fingerprint but nobody saved the details (they never reached the server)
  if (r.fingerprint)
    return (
      <p className="flex items-start gap-2 text-body-sm text-ink-muted" data-saved-receipt="missing">
        <ReceiptText aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
        {t("details.receipt.missing")}
      </p>
    )
  return null
}

export function SavedReceiptCard({ receipt: r, check }: { receipt: SavedReceipt; check: FingerprintStatus }) {
  const id = useId()
  const [itemsOpen, setItemsOpen] = useState(false)
  const title = [r.merchant ?? t("spend.receipt.read.title"), r.date ? receiptDay(r.date) : null].filter(Boolean).join(" · ")
  const extras = [
    r.taxCents !== null ? { label: t("spend.receipt.tax"), cents: r.taxCents } : null,
    r.tipCents !== null ? { label: t("spend.receipt.tip"), cents: r.tipCents } : null,
  ].filter((x): x is { label: string; cents: number } => x !== null)
  const converted = convertedLine(r)
  const hasList = r.items.length > 0 || extras.length > 0
  return (
    <section aria-labelledby={`${id}-h`} className="flex flex-col gap-3" data-saved-receipt="ready">
      <h3 id={`${id}-h`} className="text-label text-ink">
        {t("details.receipt.header")}
      </h3>
      <div className="rounded-md border border-line bg-surface-sunken">
        <div className="flex min-h-12 items-center gap-2.5 px-3 py-2">
          <ReceiptText aria-hidden className="size-5 shrink-0 text-ink" strokeWidth={2} />
          <p className="min-w-0 flex-1 text-label break-words text-ink" data-saved-receipt-title>
            {title}
          </p>
          <p className="shrink-0">
            <span className="sr-only">{t("details.receipt.total")} </span>
            <span data-money className="text-label text-ink tabular-nums" data-saved-receipt-total>
              {formatReceiptMoney(r.totalCents, r.currency)}
            </span>
          </p>
        </div>
        {converted && (
          <p className="-mt-1 px-3 pb-2.5 pl-10.5 text-body-sm text-ink-muted tabular-nums" data-money data-saved-receipt-fx>
            {converted}
          </p>
        )}
        {hasList && (
          <div className="border-t border-line px-3 py-1">
            <button
              type="button"
              aria-expanded={itemsOpen}
              aria-controls={`${id}-items`}
              onClick={() => setItemsOpen((o) => !o)}
              className="-ml-1 inline-flex min-h-11 items-center gap-1.5 rounded-sm px-1 text-body-sm text-ink"
              data-saved-receipt-toggle
            >
              {itemsOpen ? t("spend.receipt.items.hide") : t("spend.receipt.items.show", { n: r.items.length })}
              <ChevronDown aria-hidden className={cn("size-4 shrink-0 text-ink-muted transition-transform duration-120", itemsOpen && "rotate-180")} strokeWidth={2} />
            </button>
            <ul id={`${id}-items`} hidden={!itemsOpen} aria-label={t("spend.receipt.items.label")} className="flex flex-col gap-1 pb-2" data-saved-receipt-items>
              {r.items.map((it, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3 text-body-sm text-ink">
                  <span className="min-w-0 wrap-break-word">
                    {it.name}
                    {it.qty !== null && it.qty !== 1 && <span className="ml-1 text-ink-muted tabular-nums">{t("spend.receipt.qty", { qty: it.qty })}</span>}
                  </span>
                  {it.amountCents !== null && (
                    <span data-money className="shrink-0 tabular-nums">
                      {formatReceiptMoney(it.amountCents, r.currency)}
                    </span>
                  )}
                </li>
              ))}
              {extras.map((x) => (
                <li key={x.label} className="flex items-baseline justify-between gap-3 border-t border-line pt-1 text-body-sm text-ink-muted">
                  <span>{x.label}</span>
                  <span data-money className="tabular-nums">
                    {formatReceiptMoney(x.cents, r.currency)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <ReadPrivately receipt={r} />
      <FingerprintCheck check={check} />
    </section>
  )
}

/** "Read privately · Check it yourself ↗" (the proof link, when the reading carries one). */
function ReadPrivately({ receipt: r }: { receipt: SavedReceipt }) {
  return (
    <div className="flex flex-col gap-1" data-saved-receipt-private>
      <p className="flex flex-wrap items-center gap-x-1.5 text-body-sm text-ink">
        <ShieldCheck aria-hidden className="size-4 shrink-0" strokeWidth={2} />
        {t("spend.receipt.private")}
        {r.proof && (
          <>
            <span aria-hidden className="text-ink-muted">
              ·
            </span>
            <a
              href={r.proof.verifyUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t("spend.receipt.private.check.label")}
              data-saved-receipt-verify
              className="inline-flex min-h-11 items-center gap-0.5 rounded-sm text-link underline-offset-4 hover:underline"
            >
              {t("spend.receipt.private.check")}
              <ArrowUpRight aria-hidden className="size-3.5" strokeWidth={2} />
            </a>
          </>
        )}
      </p>
      <p className="text-body-sm text-ink-muted">
        {r.source === "mock" ? t("details.receipt.sample") : t("details.receipt.read_on", { date: receiptDay(r.readAt.slice(0, 10)) })}
        {r.proof?.reply ? ` ${t("spend.receipt.private.reply")}` : ""}
      </p>
    </div>
  )
}

/** The saved details against the fingerprint the spend carries (icon + word), and how that works. */
export function FingerprintCheck({ check }: { check: FingerprintStatus }) {
  const id = useId()
  const [open, setOpen] = useState(false)
  if (check === "missing") return null
  const ok = check === "match"
  const [title, body] = ok ? [t("details.fingerprint.match"), t("details.fingerprint.match.body")] : tLines("details.fingerprint.mismatch")
  return (
    <div className={cn("flex flex-col gap-1 rounded-md p-3", ok ? "bg-surface-sunken" : "border border-line-strong bg-surface")} data-fingerprint={check}>
      <p className="flex items-start gap-2 text-label text-ink">
        {ok ? (
          <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-approved" strokeWidth={2.25} />
        ) : (
          <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-declined" strokeWidth={2.25} />
        )}
        <span>{title}</span>
      </p>
      {body && <p className="pl-7 text-body-sm text-ink-muted">{body}</p>}
      <div className="pl-6">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${id}-how`}
          onClick={() => setOpen((o) => !o)}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-sm px-1 text-body-sm text-ink"
          data-fingerprint-how
        >
          <CircleHelp aria-hidden className="size-4 shrink-0 text-ink-muted" strokeWidth={2} />
          {t("details.fingerprint.how")}
          <ChevronDown aria-hidden className={cn("size-4 shrink-0 text-ink-muted transition-transform duration-120", open && "rotate-180")} strokeWidth={2} />
        </button>
        <div id={`${id}-how`} hidden={!open} className="flex flex-col gap-2 px-1 pb-1 text-body-sm text-ink-muted">
          <p>{t("details.fingerprint.how.body")}</p>
          <p>{t("details.fingerprint.how.public")}</p>
        </div>
      </div>
    </div>
  )
}
