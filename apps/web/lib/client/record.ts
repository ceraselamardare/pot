// The public Pot record (hub 1.1.0 get_record; the "social" + "realworld" prompts): every spend, who asked, how it
// was approved (the rules / one OK by X / the group), where the money is (paid, waiting, returned…) and its receipt.
// Pure: rows come from the Pot's own request view models (members, mock) or from get_record entries (anyone with
// the link, testnet), and `recordCsv` turns them into an accountant-readable CSV (RFC 4180, CRLF, a BOM so
// spreadsheets read UTF-8, cells that start like a formula are prefixed with ' so they can't run).
// Privacy: the page shows what is already public on chain (amounts, reasons, account-derived names); display names
// from the group and notes only for members (the feed route's gating, M-7).
import type { RecordEntry } from "@pot/sdk"
import { t } from "@/i18n/t"
import { isTxHash } from "./explorer"
import type { Category, PersonVM, RequestVM } from "./mock/types"
import type { PayInTone } from "@/lib/gifts"
import { formatUsd, toCents, type Micro } from "./money"

export type RecordStatus = "paid" | "pending" | "processing" | "declined" | "expired" | "withdrawn" | "failed" | "returned" | "held" | "cancelled"
export type ApprovedBy = "rules" | "one_ok" | "group" | null

export interface RecordRow {
  id: number
  /** when it was asked */
  at: number
  person: PersonVM
  /** who the money went to (a link's claimer once claimed); null while unknown */
  payee: PersonVM | null
  amount: Micro
  category: Category
  /** the note (members) or the reason chip's word */
  reason: string
  approvedBy: ApprovedBy
  okBy: PersonVM | null
  status: RecordStatus
  txHash?: string
  /** receipt details were saved with the spend (visitors see only that; members open the details) */
  receipt?: boolean
}

const word = (c: Category) => t(`spend.reason.word.${c}` as `spend.reason.word.${Category}`)

/** How a request was approved (the Pot's rules / one OK / the group), null while it isn't. */
export function approvedByOf(r: Pick<RequestVM, "status" | "path" | "okBy">): ApprovedBy {
  const approved = r.status === "instant" || r.status === "approved" || r.status === "failed"
  return !approved ? null : r.status === "instant" || r.path === "instant" ? "rules" : r.okBy ? "one_ok" : "group"
}

/** A request's status in the record's words (Paid, Waiting, Declined…). */
export function recordStatusOf(r: Pick<RequestVM, "status">): RecordStatus {
  return r.status === "instant" || r.status === "approved" ? "paid" : r.status === "needs" ? "pending" : r.status === "failed" ? "failed" : r.status
}

/** A member's view: the Pot's requests (both data sources produce RequestVMs), oldest first. */
/**
 * What a visitor (not in the Pot) sees of a row, the live record's twin (privacy audit 2026-11-02): no notes (the
 * reason chip's word), no chosen names or pictures (the account's own first name, else "A friend"; initials only).
 * `nameOf` turns an account into its public first name (live/vm nameFromAccount).
 */
export function visitorRow(r: RecordRow, nameOf: (account: string) => string | null): RecordRow {
  const pub = (p: PersonVM): PersonVM => {
    const name = nameOf(p.id) ?? t("person.fallback")
    const initials = name
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase())
      .join("")
      .slice(0, 2)
    return { id: p.id, name, initials: initials || "•", joinIndex: p.joinIndex, avatar: null }
  }
  return { ...r, person: pub(r.person), payee: r.payee ? pub(r.payee) : null, okBy: r.okBy ? pub(r.okBy) : null, reason: word(r.category) }
}

export function rowsFromRequests(reqs: readonly RequestVM[]): RecordRow[] {
  return [...reqs]
    .sort((a, b) => a.createdAt - b.createdAt || a.id - b.id)
    .map((r) => {
      const approvedBy = approvedByOf(r)
      const status = recordStatusOf(r)
      return {
        id: r.id,
        at: r.createdAt,
        person: r.requester,
        payee: r.receiver,
        amount: r.amount,
        category: r.category,
        reason: r.note?.trim() || word(r.category),
        approvedBy,
        okBy: r.okBy ?? null,
        status,
        ...(r.txHash ? { txHash: r.txHash } : {}),
        ...(r.hasReceipt ? { receipt: true } : {}),
      }
    })
}

const MONEY: Record<RecordEntry["money"], RecordStatus> = {
  paid: "paid",
  held_for_link: "held",
  awaiting_funds: "processing",
  returned: "returned",
  processing: "processing",
  awaiting_approval: "pending",
  failed: "failed",
  declined: "declined",
  expired: "expired",
  withdrawn: "withdrawn",
  void: "cancelled",
}

/** Anyone's view (get_record): names from `person` (account-derived for visitors), notes and receipts when known. */
export function rowsFromEntries(
  entries: readonly RecordEntry[],
  person: (account: string) => PersonVM,
  extra: { notes?: Record<string, string>; txByRef?: Record<string, string>; receipts?: readonly string[] } = {},
): RecordRow[] {
  const withReceipt = new Set(extra.receipts ?? [])
  return [...entries]
    .sort((a, b) => a.createdAtMs - b.createdAtMs || a.requestId - b.requestId)
    .map((e) => ({
      id: e.requestId,
      at: e.createdAtMs,
      person: person(e.requester),
      payee: e.payee ? person(e.payee) : null,
      amount: e.amount,
      category: e.category,
      reason: extra.notes?.[e.requestRef]?.trim() || word(e.category),
      approvedBy: e.approvedBy,
      okBy: e.okBy ? person(e.okBy) : null,
      status: MONEY[e.money] ?? "processing",
      ...(extra.txByRef?.[e.requestRef] ? { txHash: extra.txByRef[e.requestRef] } : {}),
      ...(withReceipt.has(String(e.requestId)) ? { receipt: true } : {}),
    }))
}

export function approvedWords(r: Pick<RecordRow, "approvedBy" | "okBy">): string {
  switch (r.approvedBy) {
    case "rules":
      return t("record.approved.rules")
    case "one_ok":
      return t("record.approved.one_ok", { name: r.okBy?.name ?? t("person.fallback") })
    case "group":
      return t("record.approved.group")
    default:
      return t("record.approved.none")
  }
}

export const statusWord = (s: RecordStatus): string => t(`record.status.${s}` as `record.status.${RecordStatus}`)

/** Paid out = every row whose money left the Pot (paid, or held for a link). */
export function paidOut(rows: readonly RecordRow[]): Micro {
  return rows.filter((r) => r.status === "paid" || r.status === "held").reduce((s, r) => s + r.amount, 0n)
}

// ------------------------------------------------------------------------------------------------- CSV

/** One CSV cell: quoted when needed; a leading = + - @ (or tab/CR) is neutralised so a spreadsheet won't run it. */
export function csvCell(v: string): string {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/** yyyy-mm-dd in UTC (unambiguous for an accountant, whatever the viewer's zone). */
export const isoDate = (ms: number): string => new Date(ms).toISOString().slice(0, 10)

/** "84.00": dollars with two decimals, no symbol or grouping (a spreadsheet reads it as a number). */
export function csvAmount(m: Micro): string {
  const c = toCents(m)
  return `${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`
}

/** A gift in the CSV (hub 1.2.0): money in, so it's its own kind of row. */
export interface CsvGift {
  at: number
  amount: Micro
  /** the giver's name only when they chose to be shown on the public gift page (never a members-only name) */
  publicName: string | null
  /** "Paid in" or "Gift" (absent: a gift, as before the tone) */
  tone?: PayInTone
  txHash?: string
}

/**
 * The CSV: one row per spend and, since gifts (hub 1.2.0), one per gift, oldest first. A gift row reads
 * Date, Pot, "Gift" (or the giver's name when they chose to be shown), amount, "Gift", "—", "Received", receipt URL.
 */
export function recordCsv(rows: readonly RecordRow[], potName: string, receiptUrl: (hash: string) => string | null, gifts: readonly CsvGift[] = []): string {
  const header = ["date", "pot", "person", "amount", "reason", "approved", "status", "receipt"].map((k) => t(`record.csv.h.${k}` as "record.csv.h.date"))
  const urlOf = (h?: string) => (h && isTxHash(h) ? (receiptUrl(h) ?? "") : "")
  const lines: { at: number; order: number; cells: string[] }[] = []
  rows.forEach((r, i) =>
    lines.push({ at: r.at, order: i, cells: [isoDate(r.at), potName, r.person.name, csvAmount(r.amount), r.reason, approvedWords(r), statusWord(r.status), urlOf(r.txHash)] }),
  )
  gifts.forEach((g, i) => {
    const word = g.tone === "payment" ? t("record.payin.word") : t("record.gifts.word")
    lines.push({
      at: g.at,
      order: rows.length + i,
      cells: [isoDate(g.at), potName, g.publicName ?? word, csvAmount(g.amount), word, t("record.csv.none"), t("record.csv.gift_status"), urlOf(g.txHash)],
    })
  })
  lines.sort((a, b) => a.at - b.at || a.order - b.order)
  return `\ufeff${[header, ...lines.map((l) => l.cells)].map((c) => c.map(csvCell).join(",")).join("\r\n")}\r\n`
}

export const csvFileName = (slug: string, now: number) => `${slug}-record-${isoDate(now)}.csv`

/** The row's sentence for screen readers and the mobile card: "Maya · $84.00 for groceries · By the Pot's rules · Paid". */
export function rowSentence(r: RecordRow): string {
  return [r.person.name, `${formatUsd(r.amount)} · ${r.reason}`, approvedWords(r), statusWord(r.status)].join(" · ")
}
