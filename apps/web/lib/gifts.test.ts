// The shared gift rules (lib/gifts.ts) + the dollar input (lib/client/gifts/amount.ts).
import { describe, expect, it } from "vitest"
import { dollarsInput, GIFT_PRESET_AMOUNTS, parseDollars } from "./client/gifts/amount"
import {
  checkGiftAmount,
  cleanGiftText,
  GIFT_LINK_ID_RE,
  GIFT_REF_RE,
  giftLinkStatus,
  giftMsg,
  newGiftLinkId,
  newGiftRef,
  optionalGiftText,
} from "./gifts"

describe("ids and the hub message", () => {
  it("refs fit the hub's ref rule (8-32 [a-z0-9]) and are fresh; link ids are 22 base64url characters", () => {
    const refs = new Set(Array.from({ length: 200 }, newGiftRef))
    expect(refs.size).toBe(200)
    for (const r of refs) {
      expect(r).toMatch(GIFT_REF_RE)
      expect(r).toMatch(/^[a-z0-9]{8,32}$/)
    }
    for (let i = 0; i < 50; i++) expect(newGiftLinkId()).toMatch(GIFT_LINK_ID_RE)
  })

  it("the msg is {pot, gift} (the hub parses link → gift → contribute)", () => {
    expect(JSON.parse(giftMsg("lisbon-trip.pots.potprev.testnet", "gabc"))).toEqual({ pot: "lisbon-trip.pots.potprev.testnet", gift: "gabc" })
  })
})

describe("amounts", () => {
  it("$1 to $10,000", () => {
    expect(checkGiftAmount(999_999n)).toEqual({ ok: false, why: "too_low" })
    expect(checkGiftAmount(1_000_000n)).toEqual({ ok: true })
    expect(checkGiftAmount(10_000_000_000n)).toEqual({ ok: true })
    expect(checkGiftAmount(10_000_000_001n)).toEqual({ ok: false, why: "too_high" })
  })

  it("typed dollars ↔ Micro", () => {
    expect(parseDollars("25")).toBe(25_000_000n)
    expect(parseDollars("7.5")).toBe(7_500_000n)
    expect(parseDollars("7,50")).toBe(7_500_000n)
    expect(parseDollars(" 1 ")).toBe(1_000_000n)
    for (const bad of ["", "abc", "1.234", "-1", "1234567", "1e3"]) expect(parseDollars(bad)).toBeNull()
    expect(dollarsInput(5_000_000n)).toBe("5")
    expect(dollarsInput(7_500_000n)).toBe("7.50")
  })

  it("the presets are ☕ × 1 / × 2 / × 4 = $5 / $10 / $20", () => {
    expect(GIFT_PRESET_AMOUNTS).toEqual([
      { cups: 1, amount: 5_000_000n },
      { cups: 2, amount: 10_000_000n },
      { cups: 4, amount: 20_000_000n },
    ])
  })
})

describe("the giver's words", () => {
  it("one line: whitespace collapsed, trimmed, ≤ max code points (an emoji is one), no control or format characters", () => {
    expect(cleanGiftText("  Happy\n\tbirthday   Leo!  ", 140)).toEqual({ ok: true, value: "Happy birthday Leo!" })
    expect(cleanGiftText("☕".repeat(140), 140).ok).toBe(true)
    expect(cleanGiftText("☕".repeat(141), 140)).toEqual({ ok: false, why: "length" })
    expect(cleanGiftText("a\u0007b", 140)).toEqual({ ok: false, why: "control" })
    expect(cleanGiftText("a‮b", 140)).toEqual({ ok: false, why: "format" })
    expect(cleanGiftText("👩‍🍳", 140).ok).toBe(true)
    expect(optionalGiftText("   ", 40)).toEqual({ ok: true, value: null })
    expect(optionalGiftText(null, 40)).toEqual({ ok: true, value: null })
  })
})

describe("a link's state", () => {
  const base = { revokedAt: null, expiresAt: 1_000, reusable: true, uses: 3 }
  it("active, revoked, expired, used (one-time after one gift)", () => {
    expect(giftLinkStatus(base, 999)).toBe("active")
    expect(giftLinkStatus({ ...base, revokedAt: 5 }, 10)).toBe("revoked")
    expect(giftLinkStatus(base, 1_000)).toBe("expired")
    expect(giftLinkStatus({ ...base, reusable: false, uses: 1 }, 10)).toBe("used")
    expect(giftLinkStatus({ ...base, reusable: false, uses: 0 }, 10)).toBe("active")
  })
})
