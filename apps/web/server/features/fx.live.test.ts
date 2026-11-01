// Opt-in live check of server/features/fx.ts against the real sources (free, no key): LIVE_FX=1 pnpm vitest run
// server/features/fx.live.test.ts. Prints today's EUR rate from each source; never runs in the normal suite.
import { vi } from "vitest"
vi.mock("server-only", () => ({}))
import { describe, expect, it } from "vitest"
import { mockReceipt, type ReceiptRead } from "@/lib/receipt"
import { createLiveFx, ER_API_URL, FRANKFURTER_URL } from "./fx"

const live = process.env.LIVE_FX === "1"

describe.skipIf(!live)("live rates (LIVE_FX=1)", () => {
  it("Frankfurter (ECB) converts €42.50 with a rate from a recent working day", async () => {
    const fx = createLiveFx()
    const r = await fx.convert(mockReceipt("receipt-cafe-eur.jpg"))
    console.log("[fx.live] ECB", JSON.stringify(r))
    expect(r).toMatchObject({ ok: true, from: "EUR", amountCents: 4250, source: "ecb" })
    if (!r?.ok) return
    expect(r.rate).toBeGreaterThan(0.5)
    expect(r.rate).toBeLessThan(2)
    expect(Date.now() - Date.parse(`${r.rateDate}T00:00:00Z`)).toBeLessThan(6 * 86_400_000)
  }, 15_000)

  it("the fallback (open.er-api) answers on its own, and covers a currency the ECB doesn't publish", async () => {
    const fx = createLiveFx({ fetch: (url, init) => (String(url) === FRANKFURTER_URL ? Promise.reject(new TypeError("skip ECB")) : fetch(url, init)) })
    const eur = await fx.convert(mockReceipt("receipt-cafe-eur.jpg"))
    const aed = await fx.convert({ ...(mockReceipt("receipt-cafe-eur.jpg") as ReceiptRead), currency: "AED", totalCents: 10_000 })
    console.log("[fx.live] fallback", ER_API_URL, JSON.stringify(eur), JSON.stringify(aed))
    expect(eur).toMatchObject({ ok: true, source: "er" })
    expect(aed).toMatchObject({ ok: true, source: "er", from: "AED" })
  }, 15_000)
})
