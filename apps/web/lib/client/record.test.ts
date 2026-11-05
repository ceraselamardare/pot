// The public Pot record: rows from the Pot's requests (members / mock) and from get_record (anyone), and the
// accountant-readable CSV (header, ISO dates, plain amounts, RFC 4180 quoting, formula neutralising, BOM + CRLF).
import type { RecordEntry } from "@pot/sdk"
import { describe, expect, it } from "vitest"
import { seedWorld, potView } from "./mock/world"
import { withShowcase } from "./mock/wave4"
import type { PersonVM } from "./mock/types"
import { approvedWords, csvAmount, csvCell, csvFileName, paidOut, recordCsv, rowsFromEntries, rowsFromRequests, rowSentence, statusWord } from "./record"
import type { GiftWire } from "@/lib/gifts-api"
import { entryOfRequest, liveGiftRows } from "./record-data"

const NOW = Date.UTC(2026, 10, 1, 12)
const person = (a: string): PersonVM => ({ id: a, name: a.split(".")[0]!.replace(/^./, (c) => c.toUpperCase()), initials: a[0]!.toUpperCase(), joinIndex: null })
const URL = (h: string) => `https://testnet.nearblocks.io/txns/${h}`
const HASH = "4reLvkAWfqk5fsqio1KLudk46cqRz9erQdaHkWZKMJDZ"

const entry = (o: Partial<RecordEntry>): RecordEntry => ({
  requestId: 1,
  proposalId: null,
  requester: "maya.users.pots.testnet" as never,
  payee: "maya.users.pots.testnet" as never,
  link: false,
  amount: 84_000_000n,
  category: "groceries",
  requestRef: "ref00001",
  tier: "instant",
  approvedBy: "rules",
  okBy: null,
  hubStatus: "approved",
  money: "paid",
  linkStatus: null,
  createdAtMs: NOW,
  updatedAtMs: NOW,
  ...o,
})

describe("record rows", () => {
  it("from the showcase Pot's requests: rules / one OK by Sam / waiting, oldest first", () => {
    const w = withShowcase(seedWorld(NOW), NOW)
    const pot = potView(w, "ski-chalet", "maya", NOW)!
    const rows = rowsFromRequests(pot.feed.flatMap((f) => (f.kind === "request" ? [f.request] : [])))
    expect(rows.map((r) => [r.id, r.approvedBy, r.status])).toEqual([
      [101, "rules", "paid"],
      [102, "rules", "paid"],
      [103, "rules", "paid"],
      [104, "one_ok", "paid"],
      [105, null, "pending"],
    ])
    expect(approvedWords(rows[3]!)).toBe("One OK by Sam")
    expect(rows[0]!.reason).toBe("Supermarket run")
    expect(rows[2]!.reason).toBe("food")
    expect(paidOut(rows)).toBe(315_000_000n) // $40 + $60 + $35 + $180
    expect(rows.every((r) => !!r.txHash)).toBe(true)
  })

  it("from get_record: every money state has a word; notes and receipts only when known", () => {
    const rows = rowsFromEntries(
      [
        entry({ requestId: 3, money: "returned", link: true, payee: null, createdAtMs: NOW + 3 }),
        entry({ requestId: 2, money: "awaiting_approval", approvedBy: null, tier: "one_ok", createdAtMs: NOW + 2, requestRef: "ref00002" }),
        entry({ requestId: 1, approvedBy: "one_ok", okBy: "sam.users.pots.testnet" as never, tier: "one_ok", createdAtMs: NOW + 1 }),
      ],
      person,
      { notes: { ref00001: "Pingo Doce" }, txByRef: { ref00001: HASH } },
    )
    expect(rows.map((r) => r.id)).toEqual([1, 2, 3])
    expect(rows[0]).toMatchObject({ reason: "Pingo Doce", txHash: HASH, approvedBy: "one_ok" })
    expect(approvedWords(rows[0]!)).toBe("One OK by Sam")
    expect(rows[1]).toMatchObject({ status: "pending", reason: "groceries" })
    expect(rows[2]).toMatchObject({ status: "returned", payee: null })
    for (const m of ["paid", "held_for_link", "awaiting_funds", "returned", "processing", "awaiting_approval", "failed", "declined", "expired", "withdrawn", "void"] as const)
      expect(statusWord(rowsFromEntries([entry({ money: m })], person)[0]!.status)).not.toMatch(/^record\./)
    expect(rowSentence(rows[0]!)).toBe("Maya · $84.00 · Pingo Doce · One OK by Sam · Paid")
  })

  it("a 1.0.0 hub's get_requests reads as record entries (instant = the rules, else the group)", () => {
    const base = { id: 4, pot: "p", requester: "a", receiver: "a", amount: 1n, category: "food", requestRef: "r", reason: "within_rules", status: "paid", proposalId: 9, createdAtMs: 1, updatedAtMs: 2, expiresAtMs: 3 } as const
    expect(entryOfRequest({ ...base, path: "instant", hubStatus: "approved" } as never)).toMatchObject({ approvedBy: "rules", money: "paid", tier: "instant" })
    expect(entryOfRequest({ ...base, path: "vote", hubStatus: "pending" } as never)).toMatchObject({ approvedBy: null, money: "awaiting_approval", tier: "group" })
    expect(entryOfRequest({ ...base, path: "vote", hubStatus: "rejected", tier: "one_ok" } as never)).toMatchObject({ approvedBy: null, money: "declined", tier: "one_ok" })
    expect(entryOfRequest({ ...base, path: "vote", hubStatus: "approved", okBy: "s" } as never)).toMatchObject({ approvedBy: "one_ok", okBy: "s" })
  })
})

describe("the CSV", () => {
  it("cells: quotes, commas, newlines and formula starts are safe", () => {
    expect(csvCell("plain")).toBe("plain")
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell("a,b")).toBe('"a,b"')
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"')
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)")
    expect(csvCell("+1")).toBe("'+1")
    expect(csvCell("-2")).toBe("'-2")
    expect(csvCell("@x")).toBe("'@x")
  })

  // CLI-9 (security audit 2026-11-04): the gaps the audit found
  it("formula starts after blanks, full-width signs, tab/CR, and a ; or tab separator are all neutralised", () => {
    expect(csvCell(" =1+1")).toBe("' =1+1")
    expect(csvCell("\u00a0\u200b=HYPERLINK(1)")).toBe("'\u00a0\u200b=HYPERLINK(1)")
    expect(csvCell("\ufeff+cmd")).toBe("'\ufeff+cmd")
    expect(csvCell("\uff1dSUM(A1)")).toBe("'\uff1dSUM(A1)")
    expect(csvCell("\tfoo")).toBe('"\'\tfoo"')
    expect(csvCell("\rfoo")).toBe('"\'\rfoo"')
    expect(csvCell("\n=cmd")).toBe('"\'\n=cmd"')
    // a separator a spreadsheet may split on is quoted, so "=cmd" can't become a cell of its own
    expect(csvCell("Maya;=cmd|' /C calc'!A0")).toBe("\"Maya;=cmd|' /C calc'!A0\"")
    expect(csvCell("a\t-1")).toBe('"a\t-1"')
    expect(csvCell('=A1,"x"')).toBe('"\'=A1,""x"""')
    // ordinary text is untouched
    expect(csvCell("Maya Silva")).toBe("Maya Silva")
    expect(csvCell("Café du Col")).toBe("Café du Col")
    expect(csvCell("2026-11-05")).toBe("2026-11-05")
    expect(csvCell("84.00")).toBe("84.00")
    expect(csvCell("")).toBe("")
  })

  it("amounts are plain dollars with two decimals (floored to the cent)", () => {
    expect(csvAmount(84_000_000n)).toBe("84.00")
    expect(csvAmount(1_234_567_891n)).toBe("1234.56")
    expect(csvAmount(5_000n)).toBe("0.00")
  })

  it("one row per spend: date, pot, person, amount, reason, approved how, status, receipt URL", () => {
    const rows = rowsFromEntries(
      [entry({ requestId: 1, requestRef: "ref00001" }), entry({ requestId: 2, approvedBy: "group", requestRef: "ref00002", createdAtMs: NOW + DAYMS, category: "stay" })],
      person,
      { notes: { ref00001: 'Dinner, "the good one"' }, txByRef: { ref00001: HASH } },
    )
    const csv = recordCsv(rows, "Lisbon Trip", URL)
    expect(csv.startsWith("﻿")).toBe(true)
    const lines = csv.slice(1).split("\r\n")
    expect(lines[0]).toBe("Date,Pot,Person,Amount (USD),Reason,Approved how,Status,Receipt URL")
    expect(lines[1]).toBe(`2026-11-01,Lisbon Trip,Maya,84.00,"Dinner, ""the good one""",By the Pot's rules,Paid,${URL(HASH)}`)
    expect(lines[2]).toBe("2026-11-02,Lisbon Trip,Maya,84.00,a place to stay,By the group,Paid,")
    expect(lines[3]).toBe("")
    expect(lines).toHaveLength(4)
    expect(csvFileName("lisbon-trip", NOW)).toBe("lisbon-trip-record-2026-11-01.csv")
  })

  it("gifts (hub 1.2.0): one row each, by date among the spends; a name only when the giver chose to be shown", () => {
    const rows = rowsFromEntries([entry({ requestId: 1, requestRef: "ref00001" }), entry({ requestId: 2, requestRef: "ref00002", createdAtMs: NOW + 2 * DAYMS })], person, {})
    const csv = recordCsv(rows, "Lisbon Trip", URL, [
      { at: NOW + DAYMS, amount: 10_000_000n, publicName: null, txHash: HASH },
      { at: NOW + 3 * DAYMS, amount: 25_500_000n, publicName: "Ana" },
    ])
    const lines = csv.slice(1).split("\r\n")
    expect(lines).toHaveLength(6)
    expect(lines[1]).toMatch(/^2026-11-01,Lisbon Trip,Maya,84\.00,/)
    expect(lines[2]).toBe(`2026-11-02,Lisbon Trip,Gift,10.00,Gift,—,Received,${URL(HASH)}`)
    expect(lines[3]).toMatch(/^2026-11-03,Lisbon Trip,Maya,84\.00,/)
    expect(lines[4]).toBe("2026-11-04,Lisbon Trip,Ana,25.50,Gift,—,Received,")
    // no spends, only gifts: still a file
    expect(recordCsv([], "Leo's Birthday", URL, [{ at: NOW, amount: 5_000_000n, publicName: null }]).slice(1).split("\r\n")[1]).toBe("2026-11-01,Leo's Birthday,Gift,5.00,Gift,—,Received,")
    // "pay in": a payment reads "Paid in"
    expect(recordCsv([], "Lisbon Trip", URL, [{ at: NOW, amount: 25_000_000n, publicName: null, tone: "payment" }]).slice(1).split("\r\n")[1]).toBe("2026-11-01,Lisbon Trip,Paid in,25.00,Paid in,—,Received,")
  })
})

const DAYMS = 86_400_000

describe("the live record's gifts (hub 1.2.0)", () => {
  const wire = (o: Partial<GiftWire>): GiftWire => ({ ref: "g1", from: "eve.testnet", name: null, note: null, showPublic: false, amount: "10000000", at: "2026-11-02T10:00:00.000Z", status: "received", txHash: null, linkId: "l1", tone: "gift", ...o })
  it("members: every gift's name (else the account's) and note; the CSV name only when shown publicly", () => {
    const rows = liveGiftRows(
      {
        members: [
          wire({ ref: "g1", name: "Tomás", note: "For the cake", at: "2026-11-01T10:00:00.000Z", txHash: HASH }),
          wire({ ref: "g2", name: "Ana", note: "Happy birthday", showPublic: true, linkId: null }),
          wire({ ref: "g3", from: "alex.testnet" }),
        ],
      },
      (a) => (a === "alex.testnet" ? "Alex" : "?"),
    )
    expect(rows.map((r) => [r.key, r.name, r.note, r.publicName])).toEqual([
      ["g2", "Ana", "Happy birthday", "Ana"],
      ["g3", "Alex", null, null],
      ["g1", "Tomás", "For the cake", null],
    ])
    expect(rows[2]!.txHash).toBe(HASH)
  })
  it("visitors: only the public page's opted-in givers; nothing when there's no answer", () => {
    const rows = liveGiftRows({ page: [{ name: "Ana", note: "Hi", amount: "5000000", at: "2026-11-02T10:00:00.000Z" }], tone: "payment" }, () => "?")
    expect(rows).toEqual([{ key: "page:0:2026-11-02T10:00:00.000Z", at: Date.parse("2026-11-02T10:00:00.000Z"), amount: 5_000_000n, name: "Ana", note: "Hi", publicName: "Ana", tone: "payment" }])
    expect(liveGiftRows(null, () => "?")).toEqual([])
  })
})
