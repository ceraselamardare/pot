// U-11 text validator, config guards (test allowlist never on production/mainnet), ids.
import { vi } from "vitest"
vi.mock("server-only", () => ({}))
import { describe, expect, it } from "vitest"
import { loadConfig } from "../config"
import { clientIp } from "../http/context"
import { DEV_HMAC, hmacSecret } from "../secrets"
import { uaBound, uaFamily } from "../session/store"
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
  it("APP-3: the test allowlist needs a test runtime and never applies on Vercel or under next start", () => {
    const rule = { RELAY_TEST_ALLOWLIST: "wrap.testnet:ft_transfer:1" }
    expect(loadConfig({ ...rule, VERCEL: "1", VERCEL_ENV: "preview" }).testAllowlist).toHaveLength(0)
    expect(loadConfig({ ...rule, NODE_ENV: "production" }).testAllowlist).toHaveLength(0)
    expect(loadConfig({ ...rule, NODE_ENV: "development" }).testAllowlist).toHaveLength(0)
    expect(loadConfig({ ...rule, NODE_ENV: "production", POT_TEST_MODE: "1" }).testAllowlist).toHaveLength(1)
    expect(loadConfig({ ...rule, VERCEL: "1", POT_TEST_MODE: "1" }).testAllowlist).toHaveLength(0)
  })
  it("APP-3: the NEAR Auth nonce is always on; only next dev / tests may turn it off, explicitly", () => {
    expect(loadConfig({ NODE_ENV: "development" }).nearAuth.requireNonce).toBe(true)
    expect(loadConfig({ NODE_ENV: "development", NEAR_AUTH_REQUIRE_NONCE: "false" }).nearAuth.requireNonce).toBe(false)
    // a local `next start`, a preview on Vercel: the flag is ignored
    expect(loadConfig({ NODE_ENV: "production", NEAR_AUTH_REQUIRE_NONCE: "false" }).nearAuth.requireNonce).toBe(true)
    expect(loadConfig({ VERCEL: "1", VERCEL_ENV: "preview", NEAR_AUTH_REQUIRE_NONCE: "false" }).nearAuth.requireNonce).toBe(true)
    expect(loadConfig({ VERCEL: "1", VERCEL_ENV: "development", VERCEL_URL: "pot-dev.vercel.app" }).allowedOrigins).not.toContain(
      "http://localhost:3000",
    )
  })
  it("APP-3: the development HMAC secret only exists for next dev / tests", () => {
    expect(hmacSecret({ NODE_ENV: "test" })).toBe(DEV_HMAC)
    expect(() => hmacSecret({ NODE_ENV: "production" })).toThrow(/APP_HMAC_SECRET/)
    expect(() => hmacSecret({ NODE_ENV: "production", APP_HMAC_SECRET: DEV_HMAC })).toThrow(/development value/)
    expect(() => hmacSecret({ VERCEL: "1", NODE_ENV: "development" })).toThrow(/APP_HMAC_SECRET/)
    expect(() => hmacSecret({ NODE_ENV: "production", APP_HMAC_SECRET: "short" })).toThrow()
    expect(hmacSecret({ NODE_ENV: "production", APP_HMAC_SECRET: "s".repeat(40) })).toBe("s".repeat(40))
  })
  it("APP-7: the challenge scope differs between production and a preview of the same project", () => {
    const base = { VERCEL: "1", VERCEL_PROJECT_PRODUCTION_URL: "pot.app", VERCEL_URL: "pot-a1.vercel.app" }
    const prod = loadConfig({ ...base, VERCEL_ENV: "production" })
    const prev = loadConfig({ ...base, VERCEL_ENV: "preview", VERCEL_BRANCH_URL: "pot-git-x.vercel.app" })
    expect(prod.authScope).toBe("testnet|production|pot.app")
    expect(prev.authScope).toBe("testnet|preview|pot-git-x.vercel.app")
  })
  it("token and hub ids are configurable", () => {
    const c = loadConfig({ USDC_ID: "wrap.testnet", HUB_ID: "pots.x.testnet" })
    expect([c.usdcId, c.hubId]).toEqual(["wrap.testnet", "pots.x.testnet"])
  })
})

describe("APP-9: the client IP", () => {
  const req = new Request("https://pot.test/x", { headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1", "x-real-ip": "198.51.100.2" } })
  it("trusts proxy headers only on Vercel (or behind a declared proxy)", () => {
    expect(clientIp(req, { VERCEL: "1" })).toBe("203.0.113.7")
    expect(clientIp(req, { TRUST_PROXY_HEADERS: "1" })).toBe("203.0.113.7")
    // anywhere else a client picks the header per request: everyone shares one bucket instead
    expect(clientIp(req, {})).toBe("untrusted")
    expect(clientIp(new Request("https://pot.test/x", { headers: { "x-forwarded-for": "1.2.3.4" } }), {})).toBe("untrusted")
  })
})

describe("APP-4: sessions bound to the browser family", () => {
  const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
  it("ignores version updates, refuses another browser or a missing header", () => {
    expect(uaBound(mac, mac.replace("Chrome/130.0.0.0", "Chrome/131.0.6778.86"))).toBe(true)
    expect(uaBound(mac, mac.replace("10_15_7", "11_2"))).toBe(true)
    expect(uaBound(mac, "curl/8.7.1")).toBe(false)
    expect(uaBound(mac, null)).toBe(false)
    expect(uaBound(mac, mac.replace("Macintosh; Intel Mac OS X", "Windows NT; Win64; x64"))).toBe(false)
    // sessions stored without a user agent aren't bound
    expect(uaBound(null, "curl/8.7.1")).toBe(true)
    expect(uaFamily("Chrome/130.0.0.0")).toBe("chrome/#")
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
