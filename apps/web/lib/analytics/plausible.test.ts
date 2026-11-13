// The Plausible init snippet: it points events at our own origin and never sends a share link's secret.
import { runInNewContext } from "node:vm"
import { describe, expect, it } from "vitest"
import { analyticsEnabled, PLAUSIBLE_EVENT_PATH, PLAUSIBLE_INIT_SCRIPT } from "./plausible"

type Opts = { endpoint: string; transformRequest: (p: { u: string; n: string }) => { u: string; n: string } }

function init(): Opts {
  // the context is the global object, as `window` is in a page (the snippet uses both `window.plausible` and `plausible`)
  const g: Record<string, unknown> = { URL, URLSearchParams, location: { origin: "https://usepot.xyz", pathname: "/" } }
  g.window = g
  runInNewContext(PLAUSIBLE_INIT_SCRIPT, g, { filename: "plausible-init.js" })
  return (g.plausible as { o: Opts }).o
}
const url = (u: string) => init().transformRequest({ n: "pageview", u }).u

describe("Plausible init", () => {
  it("sends events to our own origin (the CSP allows no third-party host)", () => {
    expect(init().endpoint).toBe(PLAUSIBLE_EVENT_PATH)
    expect(PLAUSIBLE_EVENT_PATH.startsWith("/")).toBe(true)
  })

  it("drops the fragment and every query param but campaign ones", () => {
    expect(url("https://usepot.xyz/j/lisbon-trip-ab12?i=ed25519%3AABC#s3cr3t")).toBe("https://usepot.xyz/j/lisbon-trip-ab12")
    expect(url("https://usepot.xyz/c/lisbon-trip-ab12/7#s3cr3t")).toBe("https://usepot.xyz/c/lisbon-trip-ab12/7")
    expect(url("https://usepot.xyz/?utm_source=x&utm_campaign=launch&ref=nh&r=4&code=z")).toBe("https://usepot.xyz/?utm_source=x&utm_campaign=launch&ref=nh")
    expect(url("https://usepot.xyz/demo/3")).toBe("https://usepot.xyz/demo/3")
  })

  it("on Vercel production builds only", () => {
    expect(analyticsEnabled({ VERCEL_ENV: "production" })).toBe(true)
    expect(analyticsEnabled({ VERCEL_ENV: "preview" })).toBe(false)
    expect(analyticsEnabled({})).toBe(false)
  })
})
