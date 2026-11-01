// "Snap the receipt" parsing and normalization (lib/receipt.ts): the model's JSON is untrusted, so every field is
// bounded and checked before it can pre-fill the Spend sheet; amounts are cents and never converted between currencies.
import { describe, expect, it } from "vitest"
import {
  MOCK_RECEIPTS,
  RECEIPT_JSON_SCHEMA,
  RECEIPT_MAX_ITEMS,
  cleanLine,
  confidenceLevel,
  formatReceiptMoney,
  guessCategory,
  mockReceipt,
  mockReceiptKey,
  normalizeCurrency,
  normalizeDate,
  normalizeReceipt,
  parseAmountCents,
  parseModelJson,
  receiptNote,
} from "./receipt"

const NOW = Date.UTC(2026, 10, 1, 12)

describe("parseAmountCents", () => {
  it.each([
    [84.2, 8420],
    [84.199999, 8420],
    ["84.20", 8420],
    ["84,20", 8420],
    ["$ 84.20", 8420],
    ["€42,50", 4250],
    ["1,234.56", 123456],
    ["1.234,56", 123456],
    ["1,234", 123400],
    [0, 0],
    ["12", 1200],
  ])("%s → %s", (v, c) => expect(parseAmountCents(v)).toBe(c))

  it.each([[-1], ["-3.00"], ["abc"], [""], [null], [undefined], [NaN], [Infinity], [{}], [1_000_000], ["1.234.567"], ["1-2"]])("%s → null", (v) =>
    expect(parseAmountCents(v)).toBeNull(),
  )
})

describe("fields", () => {
  it("currency: ISO codes and the common symbols, else null", () => {
    expect(normalizeCurrency("usd")).toBe("USD")
    expect(normalizeCurrency(" EUR ")).toBe("EUR")
    expect(normalizeCurrency("$")).toBe("USD")
    expect(normalizeCurrency("€")).toBe("EUR")
    expect(normalizeCurrency("£")).toBe("GBP")
    expect(normalizeCurrency("dollars")).toBeNull()
    expect(normalizeCurrency(null)).toBeNull()
  })

  it("date: a real day, ≥ 2000, not in the future", () => {
    expect(normalizeDate("2026-10-28", NOW)).toBe("2026-10-28")
    expect(normalizeDate("2026-10-28T19:02:00", NOW)).toBe("2026-10-28")
    expect(normalizeDate("2026-02-30", NOW)).toBeNull()
    expect(normalizeDate("1999-12-31", NOW)).toBeNull()
    expect(normalizeDate("2026-11-05", NOW)).toBeNull()
    expect(normalizeDate("28/10/2026", NOW)).toBeNull()
  })

  it("lines: control and format characters out, collapsed, capped", () => {
    expect(cleanLine("  Pingo\u0000 Doce‮\n ", 48)).toBe("Pingo Doce")
    expect(cleanLine("x".repeat(60), 10)).toBe(`${"x".repeat(9)}…`)
    expect(cleanLine("   ", 10)).toBeNull()
    expect(cleanLine(42, 10)).toBeNull()
  })

  it("category: the model's own pick, else a keyword guess (restaurant → food), else other", () => {
    expect(guessCategory("tickets", "Somewhere", [])).toBe("tickets")
    expect(guessCategory("other", "Taberna da Rua", [])).toBe("food")
    expect(guessCategory(null, "Corner Restaurant", [])).toBe("food")
    expect(guessCategory("nonsense", "Pingo Doce", [])).toBe("groceries")
    expect(guessCategory(undefined, "Uber", [])).toBe("transport")
    expect(guessCategory(undefined, null, [{ name: "Museum entry", qty: 1, amountCents: 1500 }])).toBe("tickets")
    expect(guessCategory(undefined, "ACME 42", [])).toBe("other")
  })

  it("confidence: 0..1 or a percentage → high / medium / low", () => {
    expect(confidenceLevel(0.95)).toBe("high")
    expect(confidenceLevel("0.6")).toBe("medium")
    expect(confidenceLevel(30)).toBe("low")
    expect(confidenceLevel(null)).toBe("medium")
  })
})

describe("normalizeReceipt", () => {
  const raw = {
    readable: true,
    merchant: "Pingo Doce",
    date: "2026-10-28",
    currency: "usd",
    total: 84.2,
    tax: "4.82",
    tip: null,
    items: [
      { name: "Vinho Verde", qty: 3, amount: 17.97 },
      { name: "", qty: 1, amount: 1 },
      { name: "Bag", qty: -1, amount: "0.10" },
    ],
    category: "groceries",
    confidence: 0.9,
    extra: "ignored",
  }

  it("bounds every field and keeps amounts in cents", () => {
    expect(normalizeReceipt(raw, NOW)).toEqual({
      readable: true,
      merchant: "Pingo Doce",
      date: "2026-10-28",
      currency: "USD",
      totalCents: 8420,
      taxCents: 482,
      tipCents: null,
      items: [
        { name: "Vinho Verde", qty: 3, amountCents: 1797 },
        { name: "Bag", qty: null, amountCents: 10 },
      ],
      category: "groceries",
      confidence: "high",
    })
  })

  it("another currency stays as printed: never converted", () => {
    const r = normalizeReceipt({ ...raw, currency: "EUR", total: "42,50" }, NOW)
    expect(r).toMatchObject({ readable: true, currency: "EUR", totalCents: 4250 })
  })

  it("not a receipt, no total, a zero total or junk → unreadable", () => {
    expect(normalizeReceipt({ ...raw, readable: false }, NOW)).toEqual({ readable: false })
    expect(normalizeReceipt({ ...raw, total: null }, NOW)).toEqual({ readable: false })
    expect(normalizeReceipt({ ...raw, total: 0 }, NOW)).toEqual({ readable: false })
    expect(normalizeReceipt("nope", NOW)).toEqual({ readable: false })
    expect(normalizeReceipt({ ...raw, items: "x" }, NOW)).toEqual({ readable: false })
  })

  it("caps the items list", () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ name: `Item ${i}`, qty: 1, amount: 1 }))
    const r = normalizeReceipt({ ...raw, items: many }, NOW)
    expect(r.readable && r.items).toHaveLength(RECEIPT_MAX_ITEMS)
  })
})

describe("parseModelJson", () => {
  it("reads a bare object, a fenced block or text around one object", () => {
    expect(parseModelJson('{"total": 1}')).toEqual({ total: 1 })
    expect(parseModelJson('```json\n{"total": 1}\n```')).toEqual({ total: 1 })
    expect(parseModelJson('Here you go: {"total": 1} hope it helps')).toEqual({ total: 1 })
    expect(parseModelJson({ total: 1 })).toEqual({ total: 1 })
  })
  it("anything else is null", () => {
    expect(parseModelJson("no json here")).toBeNull()
    expect(parseModelJson("{broken")).toBeNull()
    expect(parseModelJson(null)).toBeNull()
  })
})

describe("display", () => {
  it("money in the receipt's own currency", () => {
    expect(formatReceiptMoney(8420, "USD")).toBe("$84.20")
    expect(formatReceiptMoney(4250, "EUR")).toBe("€42.50")
    expect(formatReceiptMoney(4250, "XQZ")).toMatch(/42\.50/)
    expect(formatReceiptMoney(4250, null)).toBe("42.50")
  })

  it("the note: merchant · day, ≤ 80 characters (fits the note field and the 140-character memo rule)", () => {
    expect(receiptNote({ merchant: "Pingo Doce", date: "2026-10-28" })).toBe("Pingo Doce · Oct 28")
    expect(receiptNote({ merchant: null, date: "2026-10-28" })).toBe("Oct 28")
    expect(receiptNote({ merchant: null, date: null })).toBe("")
    expect([...receiptNote({ merchant: "x".repeat(200), date: "2026-10-28" })].length).toBeLessThanOrEqual(80)
  })
})

describe("mock samples", () => {
  it("are picked by file name and already normalized", () => {
    expect(mockReceiptKey("receipt-pingo-doce.jpg")).toBe("pingo-doce")
    expect(mockReceiptKey("IMG_0042.HEIC")).toBe("pingo-doce")
    expect(mockReceiptKey("receipt-cafe-eur.jpg")).toBe("cafe-eur")
    expect(mockReceiptKey("receipt-blurry.jpg")).toBe("blurry")
    for (const sample of Object.values(MOCK_RECEIPTS)) {
      if (!sample.readable) continue
      const roundTrip = normalizeReceipt(
        {
          ...sample,
          total: sample.totalCents! / 100,
          tax: sample.taxCents === null ? null : sample.taxCents / 100,
          tip: sample.tipCents === null ? null : sample.tipCents / 100,
          items: sample.items.map((i) => ({ name: i.name, qty: i.qty, amount: i.amountCents === null ? null : i.amountCents / 100 })),
          confidence: sample.confidence === "high" ? 0.9 : 0.6,
        },
        NOW,
      )
      expect(roundTrip).toEqual(sample)
    }
    // a copy each time (the sheet may not mutate the shared sample)
    expect(mockReceipt("a.jpg")).not.toBe(mockReceipt("a.jpg"))
  })

  it("the strict schema requires every field it describes", () => {
    expect([...RECEIPT_JSON_SCHEMA.required].sort()).toEqual(Object.keys(RECEIPT_JSON_SCHEMA.properties).sort())
    expect([...RECEIPT_JSON_SCHEMA.properties.items.items.required].sort()).toEqual(Object.keys(RECEIPT_JSON_SCHEMA.properties.items.items.properties).sort())
  })
})

describe("conversion helpers (another currency → dollars)", () => {
  it("roundRate: 6 significant digits; formatRate shows exactly the digits used", async () => {
    const { roundRate, formatRate } = await import("./receipt")
    expect(roundRate(1.0852)).toBe(1.0852)
    expect(roundRate(1.0852 / 0.8338)).toBe(1.30151)
    expect(roundRate(1.0852 / 175.68)).toBe(0.00617714)
    expect(formatRate(1.0852)).toBe("1.0852")
    expect(formatRate(1.30151)).toBe("1.30151")
    expect(formatRate(0.00617714)).toBe("0.00617714")
    expect(formatRate(175.68)).toBe("175.68")
    expect(formatRate(2)).toBe("2")
    expect(() => roundRate(0)).toThrow()
  })

  it("convertCents rounds half up with no float error at the half", async () => {
    const { convertCents } = await import("./receipt")
    expect(convertCents(4250, 1.0852)).toBe(4612) // 4612.1
    expect(convertCents(100, 1.005)).toBe(101) // 100.5 exactly (a float says 100.49999…)
    expect(convertCents(50, 1.005)).toBe(50) // 50.25
    expect(convertCents(500_000, 0.00617714)).toBe(3089)
    expect(convertCents(3, 100)).toBe(300)
    expect(convertCents(0, 1.2)).toBe(0)
  })

  it("needsConversion / mockFx: only a readable non-dollar total; out of range is unsupported", async () => {
    const { needsConversion, mockFx, mockReceipt } = await import("./receipt")
    expect(needsConversion(mockReceipt())).toBe(false)
    expect(needsConversion(mockReceipt("receipt-cafe-eur.jpg"))).toBe(true)
    expect(needsConversion({ readable: false })).toBe(false)
    const now = Date.UTC(2026, 10, 1)
    expect(mockFx(mockReceipt("receipt-cafe-eur.jpg"), now)).toEqual({ ok: true, from: "EUR", amountCents: 4250, usdCents: 4612, rate: 1.0852, rateDate: "2026-11-01", source: "sample" })
    const huge = { ...(mockReceipt("receipt-cafe-eur.jpg") as Extract<ReturnType<typeof mockReceipt>, { readable: true }>), totalCents: 99_999_999 }
    expect(mockFx(huge, now)).toEqual({ ok: false, from: "EUR", why: "unsupported" }) // over the keypad's $999,999.99
  })
})
