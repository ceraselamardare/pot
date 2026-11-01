"use client"
// The public Pot record (/p/<slug>/record; hub 1.1.0 get_record): every spend in one read-only page anyone with
// the link can open (the "social" prompt), with an accountant-readable CSV of the same rows (the "realworld" one).
// Each row: when, who asked, for what, how much, how it was approved (the Pot's rules / one OK by X / the group)
// and where the money is (paid, waiting, returned…), with its receipt when known. A table from md up; a list of
// cards on phones (no sideways scroll at 320 px). No marigold here: nothing to decide, only to read and share.
import { ChevronLeft, Copy, Download, Link2 } from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { Bone, EmptyState } from "@/components/feedback/States"
import { MoneyText } from "@/components/money/MoneyText"
import { Avatar } from "@/components/pot/Avatar"
import { CoverTile } from "@/components/pot/CoverTile"
import { RecordStatusChip } from "@/components/record/RecordStatusChip"
import { ReceiptLink } from "@/components/receipt/ReceiptLink"
import { ReceiptIndicator } from "@/components/receipt/ReceiptIndicator"
import { Button } from "@/components/ui/button"
import { pageTitle, t } from "@/i18n/t"
import { explorerTxUrl } from "@/lib/client/explorer"
import { formatUsd } from "@/lib/client/money"
import { approvedWords, csvFileName, paidOut, recordCsv, rowSentence, type RecordRow } from "@/lib/client/record"
import { useRecord } from "@/lib/client/record-data"
import { formatDate } from "@/lib/client/time"

const Status = RecordStatusChip

/** "Receipt attached" for everyone; a member also gets "See details" (the spend's sheet on the Pot). */
function ReceiptAttached({ row, slug, member }: { row: RecordRow; slug: string; member: boolean }) {
  if (!row.receipt) return null
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 text-body-sm text-ink-muted" data-record-receipt>
      <ReceiptIndicator />
      {member && (
        <Link
          href={`/p/${encodeURIComponent(slug)}?r=${row.id}`}
          aria-label={t("record.receipt.details.label", { what: rowSentence(row) })}
          className="inline-flex min-h-6 items-center rounded-sm text-link underline-offset-4 hover:underline"
          data-record-receipt-details
        >
          {t("record.receipt.details")}
        </Link>
      )}
    </span>
  )
}

function download(rows: RecordRow[], potName: string, slug: string) {
  const blob = new Blob([recordCsv(rows, potName, explorerTxUrl)], { type: "text/csv;charset=utf-8" })
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
  const [copied, setCopied] = useState(false)
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
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href.split("#")[0]!)
      setCopied(true)
      setTimeout(() => setCopied(false), 2_000)
    } catch {
      toast(window.location.href)
    }
  }
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
          <Button onClick={() => download(rows, potName, r.slug)} disabled={rows.length === 0} data-record-csv>
            <Download aria-hidden strokeWidth={2.25} />
            {t("record.csv")}
          </Button>
          <Button variant="ghost" onClick={copy} data-record-copy>
            {copied ? <Link2 aria-hidden strokeWidth={2.25} /> : <Copy aria-hidden strokeWidth={2.25} />}
            {copied ? t("record.copied") : t("record.copy")}
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
                <li key={row.id} aria-label={rowSentence(row)} className="relative rounded-md bg-surface p-3" data-record-row={row.id}>
                  <div className="flex items-start gap-3">
                    <Avatar person={row.person} size="sm" ring="surface" className="mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-body text-ink">
                        <span className="font-semibold">{row.person.name}</span> · {row.reason}
                      </p>
                      <p className="mt-0.5 text-body-sm text-ink-muted">
                        {formatDate(row.at)} · {approvedWords(row)}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Status s={row.status} />
                        <ReceiptLink txHash={row.txHash} what={rowSentence(row)} />
                      </div>
                      {row.receipt && (
                        <div className="mt-1.5">
                          <ReceiptAttached row={row} slug={r.slug} member={r.member} />
                        </div>
                      )}
                    </div>
                    <MoneyText micro={row.amount} className="shrink-0 pt-0.5 text-ink" />
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
      </main>
    </>
  )
}
