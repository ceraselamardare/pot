// U-11 text validator, config guards (test allowlist never on production/mainnet), ids.
import { vi } from "vitest"
vi.mock("server-only", () => ({}))
import { describe, expect, it } from "vitest"
import { loadConfig } from "../config"
import { daoSlug } from "./ids"
import { cleanDisplayName, cleanNote, defaultDisplayName } from "./text"

describe("text validator (U-11)", () => {
  it.each([
    ["Maya", true],
    ["  Maya  ", true],
    ["👩‍👩‍👧", true], // ZWJ sequence allowed
    ["❤️", true], // VS16 allowed
    ["", false],
    ["x".repeat(41), false],
    ["Ma‮ya", false], // bidi override (Cf)
    ["Ma​ya", false], // zero-width space (Cf)
    ["Ma\u0000ya", false],
    ["line break", false],
    ["Admin", false],
    ["support", false],
  ])("display name %j → %s", (v, ok) => {
    expect(cleanDisplayName(v).ok).toBe(ok)
  })
  it("NFC-normalizes and trims", () => {
    const r = cleanNote("  é  ")
    expect(r).toEqual({ ok: true, value: "é" })
  })
  it("default names never come from the email", () => {
    expect(defaultDisplayName(undefined, undefined)).toBe("Friend")
    expect(defaultDisplayName("Sam", "Sam Smith")).toBe("Sam")
    expect(defaultDisplayName("Admin", "Leo")).toBe("Leo")
  })
})

describe("config guards", () => {
  it("the test-only relay allowlist is ignored on production and on mainnet", () => {
    expect(loadConfig({ RELAY_TEST_ALLOWLIST: "wrap.testnet:ft_transfer:1" }).testAllowlist).toHaveLength(1)
    expect(loadConfig({ RELAY_TEST_ALLOWLIST: "wrap.testnet:ft_transfer:1", VERCEL_ENV: "production" }).testAllowlist).toHaveLength(0)
    expect(loadConfig({ RELAY_TEST_ALLOWLIST: "wrap.testnet:ft_transfer:1", NEXT_PUBLIC_NETWORK: "mainnet" }).testAllowlist).toHaveLength(0)
  })
  it("production requires the device-bound nonce; cookies are __Host- on https", () => {
    const p = loadConfig({ VERCEL_ENV: "production", NEXT_PUBLIC_APP_URL: "https://pot.app" })
    expect(p.nearAuth.requireNonce).toBe(true)
    expect(p.secureCookies).toBe(true)
    expect(loadConfig({}).secureCookies).toBe(false)
  })
  it("token and hub ids are configurable", () => {
    const c = loadConfig({ USDC_ID: "wrap.testnet", HUB_ID: "pots.x.testnet" })
    expect([c.usdcId, c.hubId]).toEqual(["wrap.testnet", "pots.x.testnet"])
  })
})

describe("DAO ids", () => {
  it("exactly one valid slug label above the hub", () => {
    expect(daoSlug("lisbon-trip.pots.x.testnet", "pots.x.testnet")).toBe("lisbon-trip")
    expect(daoSlug("a.b.pots.x.testnet", "pots.x.testnet")).toBeNull()
    expect(daoSlug("pots.x.testnet", "pots.x.testnet")).toBeNull()
    expect(daoSlug("x--y.pots.x.testnet", "pots.x.testnet")).toBeNull()
  })
})
