// Pay by link, the pure parts: the link URL (round trip through @pot/sdk), the #secret check, the status table
// (hub link status × request status × date), the label cleaner and the daily job's selection.
import { parseClaimLink } from "@pot/sdk"
import { describe, expect, it } from "vitest"
import { canCancel, claimUrl, cleanLabel, LABEL_MAX, LINK_TTL_MS, linkExpiry, linkStatusOf, moneyLeftPot, secretFromHash, selectReclaimable, type HubLinkStatus } from "./link"

const SECRET = "BRgrPlFkd4qdsMPW6fwPIjVIW26BlKe6zeDzBhksP1I"
const NOW = 1_800_000_000_000

describe("claim URL", () => {
  it("is /c/<slug>/<id>#<secret> and parses back (secret only in the fragment)", () => {
    const url = claimUrl("https://pot.example", "lisbon-trip", 7, SECRET)
    expect(url).toBe(`https://pot.example/c/lisbon-trip/7#${SECRET}`)
    const u = new URL(url)
    expect(u.pathname + u.search).not.toContain(SECRET)
    expect(parseClaimLink(url)).toEqual({ slug: "lisbon-trip", requestId: 7, secret: SECRET })
  })

  it("a new link lasts 14 days", () => {
    expect(LINK_TTL_MS).toBe(14 * 86_400_000)
    expect(linkExpiry(NOW)).toBe(NOW + 14 * 86_400_000)
  })
})

describe("secretFromHash", () => {
  it("accepts the 43-char base64url secret, with or without #", () => {
    expect(secretFromHash(`#${SECRET}`)).toEqual({ secret: SECRET })
    expect(secretFromHash(SECRET)).toEqual({ secret: SECRET })
  })
  it("tells a missing fragment from a cut or changed one", () => {
    expect(secretFromHash("")).toEqual({ error: "missing" })
    expect(secretFromHash("#")).toEqual({ error: "missing" })
    expect(secretFromHash(`#${SECRET.slice(0, 30)}`)).toEqual({ error: "malformed" })
    expect(secretFromHash(`#${SECRET}x`)).toEqual({ error: "malformed" })
    expect(secretFromHash(`#${SECRET.slice(0, 42)}+`)).toEqual({ error: "malformed" })
  })
})

describe("linkStatusOf", () => {
  const exp = NOW + 1000
  const rows: [HubLinkStatus, Parameters<typeof linkStatusOf>[1], number, string][] = [
    ["awaiting_funds", "needs", NOW, "waiting"],
    ["awaiting_funds", "approved", NOW, "waiting"], // approved, the money is on its way (or a retry)
    ["awaiting_funds", "failed", NOW, "waiting"],
    ["awaiting_funds", "declined", NOW, "void"],
    ["awaiting_funds", "expired", NOW, "void"],
    ["funded", "instant", NOW, "ready"],
    ["funded", "approved", exp, "expired"],
    ["funded", "instant", exp + 5, "expired"],
    ["claiming", "instant", NOW, "busy"],
    ["returning", "instant", NOW, "busy"],
    ["claimed", "instant", exp + 5, "claimed"],
    ["returned", "instant", NOW, "returned"],
    ["void", "declined", NOW, "void"],
  ]
  it.each(rows)("%s + request %s at t → %s", (hub, req, now, want) => {
    expect(linkStatusOf(hub, req, exp, now)).toBe(want)
  })
  it("money is out of the Pot only while the link holds it or after a claim", () => {
    expect(["ready", "busy", "claimed", "expired"].every((s) => moneyLeftPot(s as never))).toBe(true)
    expect(["waiting", "returned", "void"].some((s) => moneyLeftPot(s as never))).toBe(false)
    expect(canCancel("ready")).toBe(true)
    expect(canCancel("expired")).toBe(true)
    expect(canCancel("claimed")).toBe(false)
    expect(canCancel("waiting")).toBe(false)
  })
})

describe("cleanLabel", () => {
  it("trims, joins lines, keeps ≤ 40 code points, empty → null", () => {
    expect(cleanLabel("  Casa Lisboa host  ")).toBe("Casa Lisboa host")
    expect(cleanLabel("Casa\nLisboa host")).toBe("Casa Lisboa host")
    expect(cleanLabel("   ")).toBeNull()
    expect([...cleanLabel("🏄".repeat(60))!].length).toBe(LABEL_MAX)
  })
})

describe("selectReclaimable (the daily job)", () => {
  const l = (id: number, linkStatus: HubLinkStatus, requestStatus: string, expiresAtMs: number) => ({ id, linkStatus, requestStatus, expiresAtMs })
  it("takes funded links and approved-but-unfunded ones past their date, oldest first, bounded", () => {
    const all = [
      l(1, "funded", "approved", NOW - 10),
      l(2, "funded", "approved", NOW + 10), // not yet
      l(3, "awaiting_funds", "approved", NOW - 100), // the escrow payment bounced
      l(4, "awaiting_funds", "pending", NOW - 100), // still being decided: the hub refuses (ERR_LINK_NOT_FINAL)
      l(5, "claimed", "approved", NOW - 100),
      l(6, "returned", "approved", NOW - 100),
      l(7, "claiming", "approved", NOW - 100), // busy
      l(8, "funded", "approved", NOW), // exactly at its date: the hub allows it (now >= expires)
    ]
    expect(selectReclaimable(all, NOW, 10).map((x) => x.id)).toEqual([3, 1, 8])
    expect(selectReclaimable(all, NOW, 2).map((x) => x.id)).toEqual([3, 1])
    expect(selectReclaimable(all, NOW, 0)).toEqual([])
  })
})
