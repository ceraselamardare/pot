"use client"
// The public Pot record (/p/<slug>/record; hub 1.1.0 get_record): every spend in one read-only page anyone with
// the link can open (the "social" prompt), with an accountant-readable CSV of the same rows (the "realworld" one).
// Each row: when, who asked, for what, how much, how it was approved (the Pot's rules / one OK by X / the group)
// and where the money is (paid, waiting, returned…), with its receipt when known. A table from md up; on phones
// compact cards (CompactRow's anatomy: avatar + reason badge, "Maya · groceries" and the amount, then the status
// chip, how it was approved, the receipt mark and the date; the explorer link and "See details" on a third line
// only when there is one), with no sideways scroll at 320 px. No marigold on the page: nothing to decide, only to read
// and share ([Share] opens the QR-first RecordShareSheet, whose [Share link] is that sheet's one marigold).
import { ChevronLeft, Download, Gift, Share2 } from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useState } from "react"
import { Bone, EmptyState } from "@/components/feedback/States"
import { MoneyText } from "@/components/money/MoneyText"
import { Avatar } from "@/components/pot/Avatar"
import { LeadAvatar, REASON_ICON, ReceiptMark } from "@/components/pot/CompactRow"
import { CoverTile } from "@/components/pot/CoverTile"
import { RecordShareSheet } from "@/components/record/RecordShareSheet"
import { RecordStatusChip } from "@/components/record/RecordStatusChip"
import { ReceiptLink } from "@/components/receipt/ReceiptLink"
import { ReceiptIndicator } from "@/components/receipt/ReceiptIndicator"
import { PrivacySheet } from "@/components/sheets/PrivacySheet"
import { Button } from "@/components/ui/button"
import { pageTitle, t } from "@/i18n/t"
import { explorerTxUrl, isTxHash } from "@/lib/client/explorer"
import { formatUsd } from "@/lib/client/money"
import { approvedWords, csvFileName, paidOut, recordCsv, rowSentence, type RecordRow } from "@/lib/client/record"
import { useRecord, type RecordGiftRow } from "@/lib/client/record-data"
import { LeadTile } from "@/components/pot/CompactRow"
import { formatDate } from "@/lib/client/time"

const Status = RecordStatusChip

/** A member's "See details" (the spend's sheet on the Pot, with its receipt). */
function SeeDetails({ row, slug }: { row: RecordRow; slug: string }) {
  return (
    <Link
      href={`/p/${encodeURIComponent(slug)}?r=${row.id}`}
      aria-label={t("record.receipt.details.label", { what: rowSentence(row) })}
      className="inline-flex min-h-6 items-center rounded-sm text-link underline-offset-4 hover:underline"
      data-record-receipt-details
    >
      {t("record.receipt.details")}
    </Link>
  )
}

/** "Receipt attached" for everyone; a member also gets "See details" (the spend's sheet on the Pot). */
function ReceiptAttached({ row, slug, member }: { row: RecordRow; slug: string; member: boolean }) {
  if (!row.receipt) return null
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 text-body-sm text-ink-muted" data-record-receipt>
      <ReceiptIndicator />
      {member && <SeeDetails row={row} slug={slug} />}
    </span>
  )
}

function download(rows: RecordRow[], potName: string, slug: string, gifts: readonly RecordGiftRow[]) {
  // gift rows carry only a name the giver chose to show publicly, whoever downloads the file
  const csvGifts = gifts.map((g) => ({ at: g.at, amount: g.amount, publicName: g.publicName, ...(g.txHash ? { txHash: g.txHash } : {}) }))
  const blob = new Blob([recordCsv(rows, potName, explorerTxUrl, csvGifts)], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = csvFileName(slug, Date.now())
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

export function RecordScreen() {
  const { slug } = useParams<{ slug: string }>()
  const r = useRecord(slug)
  const [shareOpen, setShareOpen] = useState(false)
  // "What's public?" (privacy audit 2026-11-02): the record is outside the shell, so it opens the sheet itself
  const [privacyOpen, setPrivacyOpen] = useState(false)
  if (r.state === "loading")
    return (
      <main id="main" className="mx-auto w-full max-w-app px-4 pt-6 md:px-6" aria-busy="true">
        <Bone className="h-9 w-64" />
        <Bone className="mt-4 h-4 w-full max-w-md" />
        <Bone className="mt-6 h-40 w-full rounded-md" />
      </main>
    )
  if (r.state === "not_found")
    return (
      <main id="main" className="mx-auto max-w-flow px-4 pt-12">
        <EmptyState headingLevel={1} title={t("record.not_found")} action={<Button render={<Link href="/" />}>{t("pot.not_found.cta")}</Button>} />
      </main>
    )
  const { rows, potName } = r
  const newestFirst = [...rows].reverse()
  return (
    <>
      <title>{pageTitle(t("record.title", { potName }))}</title>
      <main id="main" className="mx-auto w-full max-w-app px-4 pt-3 pb-12 md:px-6" data-record={r.slug}>
        <header className="flex flex-wrap items-center gap-3 pb-2">
          {r.member && (
            <Link href={`/p/${r.slug}`} aria-label={t("record.open_pot", { potName })} className="-ml-2 grid size-11 shrink-0 place-items-center rounded-pill text-ink hover:bg-surface-sunken">
              <ChevronLeft aria-hidden className="size-6" strokeWidth={2} />
            </Link>
          )}
          <CoverTile emoji={r.emoji} cover={r.cover} size="sm" />
          <div className="min-w-[10rem] flex-1">
            <p className="text-body-sm text-ink-muted">{t("record.label")}</p>
            <h1 className="font-display text-title break-words text-ink">{t("record.title", { potName })}</h1>
          </div>
        </header>
        <p className="max-w-prose text-body text-ink-muted">{t("record.intro")}</p>
        {!r.member && <p className="mt-1 max-w-prose text-body-sm text-ink-muted">{t("record.names_note")}</p>}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button onClick={() => download(rows, potName, r.slug, r.gifts ?? [])} disabled={rows.length === 0 && !r.gifts?.length} data-record-csv>
            <Download aria-hidden strokeWidth={2.25} />
            {t("record.csv")}
          </Button>
          <Button variant="ghost" onClick={() => setShareOpen(true)} data-record-share>
            <Share2 aria-hidden strokeWidth={2.25} />
            {t("record.share")}
          </Button>
          <p className="w-full text-body-sm text-ink-muted">{t("record.csv.hint")}</p>
        </div>

        <p className="mt-5 text-label text-ink tabular-nums" role="status" data-record-totals>
          {t("record.totals", { n: rows.length, paid: formatUsd(paidOut(rows), "whole") })}
        </p>

        {rows.length === 0 ? (
          <EmptyState visual="dots" headingLevel={2} title={t("record.empty")} className="mt-3 rounded-md bg-surface" />
        ) : (
          <>
            {/* phones: one card per spend */}
            <ul className="mt-3 flex flex-col gap-2 md:hidden" data-record-list>
              {newestFirst.map((row) => (
                <li key={row.id} aria-label={rowSentence(row)} className="flex items-center gap-3 rounded-md bg-surface px-3 py-2.5" data-record-row={row.id}>
                  <LeadAvatar person={row.person} badge={REASON_ICON[row.category] ?? REASON_ICON.other} />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <p className="flex min-w-0 items-baseline gap-3">
                      <span className="min-w-0 flex-1 truncate text-body text-ink">
                        <span className="font-semibold">{row.person.name}</span>
                        <span aria-hidden> · </span>
                        {row.reason}
                      </span>
                      <MoneyText micro={row.amount} className="shrink-0 text-ink" />
                    </p>
                    <div className="flex min-h-6 flex-wrap items-center gap-x-2 gap-y-1 text-body-sm text-ink-muted">
                      <Status s={row.status} size="sm" />
                      {row.approvedBy && <span className="truncate">{approvedWords(row)}</span>}
                      {row.receipt && (
                        <span className="inline-flex" data-record-receipt>
                          <ReceiptMark />
                        </span>
                      )}
                      <span className="ml-auto whitespace-nowrap tabular-nums">{formatDate(row.at)}</span>
                    </div>
                    {(isTxHash(row.txHash) || (row.receipt && r.member)) && (
                      <div className="flex flex-wrap items-center gap-x-3 text-body-sm">
                        <ReceiptLink txHash={row.txHash} what={rowSentence(row)} />
                        {row.receipt && r.member && <SeeDetails row={row} slug={r.slug} />}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {/* md and up: a real table */}
            <div className="mt-3 hidden overflow-hidden rounded-md border border-line bg-surface md:block">
              <table className="w-full border-collapse text-left text-body-sm" data-record-table>
                <caption className="sr-only">{t("record.title", { potName })}</caption>
                <thead className="bg-surface-sunken text-ink-muted">
                  <tr>
                    {(["date", "person", "reason", "amount", "approved", "status", "receipt"] as const).map((k) => (
                      <th key={k} scope="col" className={k === "amount" ? "px-3 py-2 text-right font-semibold" : "px-3 py-2 font-semibold"}>
                        {t(`record.col.${k}` as "record.col.date")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {newestFirst.map((row) => (
                    <tr key={row.id} className="border-t border-line align-middle" data-record-row={row.id}>
                      <td className="px-3 py-2 whitespace-nowrap text-ink-muted tabular-nums">{formatDate(row.at)}</td>
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-2 text-ink">
                          <Avatar person={row.person} size="xs" />
                          {row.person.name}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-ink">{row.reason}</td>
                      <td className="px-3 py-2 text-right">
                        <MoneyText micro={row.amount} className="text-ink" />
                      </td>
                      <td className="px-3 py-2 text-ink">{approvedWords(row)}</td>
                      <td className="px-3 py-2">
                        <Status s={row.status} />
                      </td>
                      <td className="px-3 py-2">
                        <span className="flex flex-col items-start gap-1">
                          <ReceiptLink txHash={row.txHash} what={rowSentence(row)} />
                          <ReceiptAttached row={row} slug={r.slug} member={r.member} />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {r.gifts && r.gifts.length > 0 && <RecordGifts gifts={r.gifts} potName={potName} />}

        <footer className="mt-8 border-t border-line pt-3 text-center">
          <button
            type="button"
            onClick={() => setPrivacyOpen(true)}
            className="min-h-11 rounded-sm px-2 text-body-sm text-ink-muted underline underline-offset-4 hover:text-ink"
            data-record-privacy
          >
            {t("privacy.record_link")}
          </button>
        </footer>
      </main>
      <PrivacySheet open={privacyOpen} onClose={() => setPrivacyOpen(false)} />
      <RecordShareSheet open={shareOpen} onClose={() => setShareOpen(false)} potName={potName} />
    </>
  )
}

/** Gifts on the record (hub 1.2.0): the amount and "Gift"; members see every giver's name and note, visitors only where the giver chose. */
function RecordGifts({ gifts, potName }: { gifts: RecordGiftRow[]; potName: string }) {
  return (
    <section aria-labelledby="record-gifts-h" className="mt-8" data-record-gifts>
      <h2 id="record-gifts-h" className="font-display text-heading text-ink">
        {t("record.gifts.title")}
      </h2>
      <ul className="mt-3 flex flex-col gap-2">
        {gifts.map((g) => {
          const what = g.name ? t("record.gifts.from", { name: g.name }) : t("record.gifts.anon")
          const amount = formatUsd(g.amount, "whole")
          return (
            <li key={g.key} aria-label={t("record.gifts.a11y", { what, amount, date: formatDate(g.at) })} className="flex items-center gap-3 rounded-md bg-surface px-3 py-2.5" data-record-gift={g.key}>
              <LeadTile icon={Gift} />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="flex min-w-0 items-baseline gap-3">
                  <span className="min-w-0 flex-1 truncate text-body text-ink">{what}</span>
                  <MoneyText micro={g.amount} sign="in" className="shrink-0 text-approved" />
                </p>
                {g.note && <p className="text-body-sm text-ink-muted [overflow-wrap:anywhere]">{g.note}</p>}
                <div className="flex flex-wrap items-center gap-x-3 text-body-sm text-ink-muted">
                  <ReceiptLink txHash={g.txHash} what={t("gift.receipt", { amount, potName })} />
                  <span className="ml-auto whitespace-nowrap tabular-nums">{formatDate(g.at)}</span>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
