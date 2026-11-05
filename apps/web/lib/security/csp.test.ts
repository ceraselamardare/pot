// CLI-1 / APP-5 (security audit 2026-11-04): the Content-Security-Policy builder (lib/security/csp.ts).
import { describe, expect, it } from "vitest"
import { contentSecurityPolicy, cspDirectives, originOf } from "./csp"

const directive = (csp: string, name: string): string[] => {
  const d = csp.split("; ").find((x) => x.startsWith(`${name} `))
  return d ? d.split(" ").slice(1) : []
}

const HOSTED = {
  NODE_ENV: "production",
  NEXT_PUBLIC_RPC_URLS: "https://rpc.testnet.fastnear.com,https://near-testnet.drpc.org",
}

describe("contentSecurityPolicy (CLI-1 / APP-5)", () => {
  it("sends every directive the audit asked for, each once", () => {
    const csp = contentSecurityPolicy(HOSTED)
    const names = csp.split("; ").map((d) => d.split(" ")[0])
    expect(names).toEqual([
      "default-src",
      "script-src",
      "style-src",
      "font-src",
      "img-src",
      "connect-src",
      "frame-src",
      "child-src",
      "worker-src",
      "manifest-src",
      "media-src",
      "object-src",
      "base-uri",
      "form-action",
      "frame-ancestors",
    ])
    expect(directive(csp, "object-src")).toEqual(["'none'"])
    expect(directive(csp, "base-uri")).toEqual(["'none'"])
    expect(directive(csp, "form-action")).toEqual(["'self'"])
    expect(directive(csp, "frame-ancestors")).toEqual(["'none'"])
    expect(directive(csp, "worker-src")).toEqual(["'self'"])
  })

  it("script-src: same origin only, no eval in a production build ('unsafe-eval' only for next dev)", () => {
    const prod = directive(contentSecurityPolicy(HOSTED), "script-src")
    expect(prod).toEqual(["'self'", "'unsafe-inline'"])
    expect(prod.some((s) => s.startsWith("http") || s === "*" || s === "https:")).toBe(false)
    expect(directive(contentSecurityPolicy({ ...HOSTED, NODE_ENV: "development" }), "script-src")).toContain("'unsafe-eval'")
  })

  it("connect-src: our origin, the two RPCs, NEAR Auth and NEAR Connect's hosts; never a wildcard or near.org", () => {
    const c = directive(contentSecurityPolicy(HOSTED), "connect-src")
    expect(c[0]).toBe("'self'")
    for (const host of [
      "https://rpc.testnet.fastnear.com",
      "https://near-testnet.drpc.org",
      "https://login.testnet.fast-auth.com",
      "https://raw.githubusercontent.com",
      "https://wallet.intear.tech",
    ])
      expect(c).toContain(host)
    expect(c.some((s) => s.includes("*") || s === "https:" || s === "wss:" || s === "data:")).toBe(false)
    expect(c.some((s) => /near\.org/.test(s))).toBe(false)
    // no 1Click / NEAR AI / FX / push host: those are server-side only
    expect(c.some((s) => /chaindefuser|near\.ai|frankfurter|push/.test(s))).toBe(false)
  })

  it("follows this build's env: RPC list and the NEAR Auth base become origins (paths dropped)", () => {
    const c = directive(
      contentSecurityPolicy({
        NEXT_PUBLIC_RPC_URLS: "http://127.0.0.1:3791/rpc",
        NEXT_PUBLIC_NEAR_AUTH_BASE_URL: "http://127.0.0.1:3792/tenant/",
      }),
      "connect-src",
    )
    expect(c).toContain("http://127.0.0.1:3791")
    expect(c).toContain("http://127.0.0.1:3792")
    expect(c).not.toContain("https://rpc.testnet.fastnear.com") // the env list replaces the default
  })

  it("refuses anything that isn't an http(s)/ws(s) origin (no injection into the header)", () => {
    expect(originOf("https://a.example/x;y")).toBe("https://a.example")
    expect(originOf("javascript:alert(1)")).toBeNull()
    expect(originOf("'unsafe-eval'")).toBeNull()
    expect(originOf("not a url")).toBeNull()
    const c = directive(
      contentSecurityPolicy({ ...HOSTED, CSP_EXTRA_CONNECT_SRC: "https://new-wallet.example/api 'unsafe-eval' *" }),
      "connect-src",
    )
    expect(c).toContain("https://new-wallet.example")
    expect(c).not.toContain("'unsafe-eval'")
    expect(c).not.toContain("*")
  })

  it("Vercel's preview toolbar is allowed on preview deployments only", () => {
    expect(contentSecurityPolicy(HOSTED)).not.toContain("vercel.live")
    const preview = contentSecurityPolicy({ ...HOSTED, VERCEL_ENV: "preview" })
    expect(directive(preview, "script-src")).toContain("https://vercel.live")
    expect(directive(preview, "frame-src")).toContain("https://vercel.live")
  })

  it("every source is a keyword, a scheme or an origin", () => {
    for (const [, srcs] of cspDirectives({ ...HOSTED, VERCEL_ENV: "preview" }))
      for (const s of srcs) expect(s).toMatch(/^('[a-z-]+'|[a-z]+:|(https?|wss?):\/\/[a-z0-9.-]+(:\d+)?)$/)
  })
})
