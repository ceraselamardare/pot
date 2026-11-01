// Encodings, validators (U-11), error-code extraction (api-spec §1.3), events.
import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { base58Decode, base58Encode, base64Decode, base64Encode, base64UrlDecode, base64UrlEncode, utf8Decode, utf8Encode } from "./encoding.ts"
import { displayNameError, hasForbiddenChars, isOpKey, isSpendRef, isValidEmoji, isValidPotName, isValidRequestRef, isValidSlug, newOpKey, noteTextError, opKeyOfRef, receiptFingerprintOfRef, slugError, spendRef } from "./validate.ts"
import { errorCodeFromText, refusedCode, stripControlChars } from "./types/errors.ts"
import { formatEventLog, isHubEvent, parseEventLog } from "./types/events.ts"
import { isAccountId, isPublicKeyStr } from "./types/ids.ts"

describe("encoding", () => {
  it("base58 matches known NEAR vectors and round-trips", () => {
    expect(base58Encode(new Uint8Array(32))).toBe("11111111111111111111111111111111")
    expect(base58Decode("11111111111111111111111111111111")).toEqual(new Uint8Array(32))
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 80 }), (b) => {
        expect(base58Decode(base58Encode(b))).toEqual(b)
      }),
    )
    expect(() => base58Decode("0OIl")).toThrow()
  })

  it("base64 (padded) and base64url (unpadded) round-trip", () => {
    expect(base64Encode(utf8Encode("{}"))).toBe("e30=")
    expect(base64Encode(utf8Encode("hello"))).toBe("aGVsbG8=")
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 120 }), (b) => {
        expect(base64Decode(base64Encode(b))).toEqual(b)
        const u = base64UrlEncode(b)
        expect(u).not.toMatch(/[+/=]/)
        expect(base64UrlDecode(u)).toEqual(b)
      }),
    )
    expect(base64UrlEncode(new Uint8Array(32))).toHaveLength(43)
    expect(() => base64UrlDecode("ab+/")).toThrow()
    expect(utf8Decode(utf8Encode("🇵🇹 Lisbon"))).toBe("🇵🇹 Lisbon")
  })
})

describe("validators (mirror the hub's, U-11)", () => {
  it("slugs", () => {
    for (const ok of ["ab", "lisbon-trip", "lisbon-trip-7k2f", "0123456789abcdef0123456789abcdef"]) expect(isValidSlug(ok)).toBe(true)
    for (const bad of ["a", "-ab", "ab-", "a--b", "a_b", "a.b", "AB", "lisbon trip", "0123456789abcdef0123456789abcdef0", ""]) expect(isValidSlug(bad)).toBe(false)
    expect(slugError("demo", "pots.potapp.testnet")).toBe("ERR_SLUG_RESERVED")
    expect(slugError("lisbon-trip", "pots.potapp.testnet")).toBeNull()
    expect(slugError("a".repeat(32), "pots.preview.verylongroot.testnet")).toBe("ERR_SLUG_INVALID")
  })

  it("names, emoji and text reject bidi overrides / Cf but keep ZWJ and VS16", () => {
    expect(isValidPotName("Lisbon Trip")).toBe(true)
    expect(isValidPotName("Été à Lisboa 🇵🇹")).toBe(true)
    expect(isValidPotName("evil\u202Etxt")).toBe(false)
    expect(isValidPotName("a\u0007b")).toBe(false)
    expect(isValidPotName("x".repeat(49))).toBe(false)
    expect(isValidPotName("x", { ui: true })).toBe(false)
    expect(hasForbiddenChars("👨\u200D👩\u200D👧")).toBe(false)
    expect(hasForbiddenChars("❤\uFE0F")).toBe(false)
    expect(hasForbiddenChars("\u2066x")).toBe(true)
    expect(isValidEmoji("🇵🇹")).toBe(true)
    expect(isValidEmoji("🏖\uFE0F")).toBe(true)
    expect(isValidEmoji("👨\u200D👩\u200D👧")).toBe(false) // 18 UTF-8 bytes > the hub's 16-byte cap
    expect(isValidEmoji("a")).toBe(false)
    expect(isValidEmoji("🇵🇹🇵🇹🇵🇹")).toBe(false) // 24 bytes > 16
    expect(displayNameError("Pot")).toBe("reserved")
    expect(displayNameError("  Leo  ")).toBeNull()
    expect(displayNameError("x\u202Ey")).toBe("bad_chars")
    expect(noteTextError("Boat trip")).toBeNull()
    expect(noteTextError("x".repeat(141))).toBe("too_long")
  })

  it("request refs and OpKeys", () => {
    expect(isValidRequestRef("k3d9x1a2b4c6m7n8")).toBe(true)
    expect(isValidRequestRef("short")).toBe(false)
    for (let i = 0; i < 200; i++) {
      const k = newOpKey()
      expect(isOpKey(k)).toBe(true)
      expect(isValidRequestRef(k)).toBe(true)
    }
    expect(isOpKey("k3d9x1a2b4c6m7nl")).toBe(false) // 'l' isn't Crockford
  })

  it("a spend's request_ref carries a receipt fingerprint in the hub's 32 chars", () => {
    const fp = "0123456789abcdef0011223344556677"
    const ref = spendRef("k3d9x1a2b4c6m7n8", fp)
    expect(ref).toBe("k3d9x1a2b4c6m7n80123456789abcdef")
    expect(ref).toHaveLength(32)
    expect(isValidRequestRef(ref)).toBe(true) // the hub's own rule: no contract change
    expect(isSpendRef(ref)).toBe(true)
    expect(opKeyOfRef(ref)).toBe("k3d9x1a2b4c6m7n8")
    expect(receiptFingerprintOfRef(ref)).toBe("0123456789abcdef")
    expect(spendRef("k3d9x1a2b4c6m7n8")).toBe("k3d9x1a2b4c6m7n8")
    expect(receiptFingerprintOfRef("k3d9x1a2b4c6m7n8")).toBeNull()
    expect(receiptFingerprintOfRef(null)).toBeNull()
    expect(isSpendRef("k3d9x1a2b4c6m7n8ABCDEF0123456789")).toBe(false) // upper-case hex
    expect(isSpendRef("k3d9x1a2b4c6m7n8zzzzzzzzzzzzzzzz")).toBe(false) // not hex
    expect(receiptFingerprintOfRef("k3d9x1a2b4c6m7n8zzzzzzzzzzzzzzzz")).toBeNull()
    expect(() => spendRef("nope", fp)).toThrow()
    expect(() => spendRef("k3d9x1a2b4c6m7n8", "XYZ")).toThrow()
  })

  it("ids", () => {
    expect(isAccountId("maya.users.potapp.testnet")).toBe(true)
    expect(isAccountId("Maya.testnet")).toBe(false)
    expect(isPublicKeyStr("ed25519:7CUDgW32nTdWTSCuZxF1TXBp6aXmJR5o6Zc4TVcdgLZh")).toBe(true)
    expect(isPublicKeyStr("ed25519:short")).toBe(false)
  })
})

describe("error codes (api-spec §1.3)", () => {
  it("takes the first ERR_ token after stripping control characters", () => {
    expect(errorCodeFromText("Smart contract panicked: ERR_POT_NOT_OPEN")).toBe("ERR_POT_NOT_OPEN")
    expect(errorCodeFromText("panicked at 'assertion failed: `(left == right)`\n  left: `1`,\n right: `0`: ERR_MIN_BOND'")).toBe("ERR_MIN_BOND")
    expect(errorCodeFromText("ERR_DEPOSIT_REQUIRED: 70000000000000000000000")).toBe("ERR_DEPOSIT_REQUIRED")
    expect(stripControlChars("a\nb\u0000c")).toBe("a b c")
  })
  it("maps NEP-141 and runtime texts to synthetic codes", () => {
    expect(errorCodeFromText("Smart contract panicked: The account maya.testnet is not registered")).toBe("RECEIVER_NOT_REGISTERED")
    expect(errorCodeFromText("The account doesn't have enough balance")).toBe("INSUFFICIENT_FUNDS")
    expect(errorCodeFromText("Exceeded the prepaid gas.")).toBe("OUT_OF_GAS")
    expect(errorCodeFromText("Smart contract panicked: Method sync doesn't accept deposit")).toBe("BAD_CALL")
    expect(errorCodeFromText("Failed to deserialize input from JSON.")).toBe("BAD_CALL")
    expect(errorCodeFromText("something else")).toBe("UNKNOWN")
    expect(refusedCode("payee_not_registered")).toBe("REFUSED_PAYEE_NOT_REGISTERED")
  })
})

describe("NEP-297 events", () => {
  it("parses the hub's EVENT_JSON lines", () => {
    const line =
      'EVENT_JSON:{"standard":"pot","version":"1.0.0","event":"spend_auto_approved","data":{"pot":"lisbon-trip.pots.potapp.testnet","request_id":0,"proposal_id":2,"requester":"maya.users.potapp.testnet","receiver_id":"maya.users.potapp.testnet","amount":"84000000","budget_used":"84000000","budget_left":"116000000"}}'
    const e = parseEventLog(line)
    expect(isHubEvent(e, "spend_auto_approved")).toBe(true)
    if (isHubEvent(e, "spend_auto_approved")) expect(e.data.budget_left).toBe("116000000")
    expect(formatEventLog(e as NonNullable<typeof e>)).toBe(line)
    expect(parseEventLog("Transfer 1 from a to b")).toBeNull()
    expect(parseEventLog("EVENT_JSON:{not json")).toBeNull()
    expect(isHubEvent({ standard: "nep141", event: "ft_transfer" })).toBe(false)
  })
})
