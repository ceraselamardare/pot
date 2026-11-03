// U-WEB-07: generated types match en.json; lint-copy catches every banned word and respects the allowlist.
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import en from "./en.json"
import { findBanned, isAllowlisted } from "./banned.mjs"
import { buildTypes } from "./gen-types.mjs"
import { lintCopy } from "./lint-copy.mjs"
import { hasKey, pageTitle, t, tLines } from "./t"

const messages = en as Record<string, string>

describe("en.json", () => {
  it("messages.d.ts is generated from the current en.json", () => {
    const committed = readFileSync(fileURLToPath(new URL("./messages.d.ts", import.meta.url)), "utf8")
    expect(committed).toBe(buildTypes(messages))
  })

  it("has no banned words outside the allowlist", () => {
    expect(lintCopy(messages)).toEqual([])
  })

  it("keeps the tech bento's six hooks plain, though home.tech.* is exempt (design-direction 08 §8)", () => {
    const hooks = Object.entries(messages).filter(([k]) => /^home\.tech\.\w+\.hook$/.test(k))
    expect(hooks).toHaveLength(6)
    for (const [k, v] of hooks) expect(findBanned(v), k).toBeNull()
  })

  it("covers the ux-spec §5 keys the flows use", () => {
    for (const k of [
      "landing.title", "landing.trust", "setup.success.title", "pot.hero.label", "pot.cta.add", "spend.checking",
      "spend.approved", "spend.sent", "approve.final", "share.expiry", "create.progress", "offline.banner",
      "members.header", "requests.badge.a11y", "add.usdc_note", "xc.warning", "notif.approval.title",
    ])
      expect(hasKey(k), k).toBe(true)
  })
})

describe("lint-copy", () => {
  it.each([
    ["Approve the proposal", "proposal"],
    ["Cast your vote", "vote"],
    ["Pay the gas fee", "gas"],
    ["Open your wallet", "wallet"],
    ["Copy the transaction hash", "transaction hash"],
    ["USDC only", "USDC"],
    ["This DAO", "DAO"],
    ["On NEAR", "NEAR"],
    ["Under the cap", "cap"],
    ["Your budget", "budget"],
    ["Settle up", "Settle"],
    ["The rulebot said yes", "Rulebot"],
  ])("catches %j", (text, word) => {
    expect(findBanned(text)?.toLowerCase()).toBe(word.toLowerCase())
    expect(lintCopy({ "pot.x": text })).toHaveLength(1)
  })

  it.each(["Meet near the beach", "Tap ••• next to the address bar", "Capture the moment", "Your browser blocked it", "Get told when friends need your OK"])(
    "passes %j",
    (text) => expect(findBanned(text)).toBeNull(),
  )

  it("respects the allowlist (prefixes, exact keys, plurals)", () => {
    expect(isAllowlisted("advanced.network")).toBe(true)
    expect(isAllowlisted("xc.title")).toBe(true)
    expect(isAllowlisted("demo.banner")).toBe(true)
    expect(isAllowlisted("notif.bot.approval")).toBe(true)
    expect(isAllowlisted("add.usdc_note")).toBe(true)
    expect(isAllowlisted("landing.more.wallet")).toBe(true)
    expect(isAllowlisted("legal.terms#other")).toBe(true)
    expect(isAllowlisted("add.source.other_wallet")).toBe(false)
    expect(isAllowlisted("notif.approval.title")).toBe(false)
    expect(lintCopy({ "xc.warning": "Only send USDC on Base", "add.cta": "Pay gas" })).toEqual([
      { key: "add.cta", word: "gas", value: "Pay gas" },
    ])
  })
})

describe("t()", () => {
  it("interpolates variables", () => {
    expect(t("landing.title", { inviter: "Maya", potName: "Lisbon Trip" })).toBe("Maya invited you to Lisbon Trip")
    expect(t("add.cta", { amount: "$150" })).toBe("Add $150")
  })
  it("picks plural forms with Intl.PluralRules", () => {
    expect(t("members.header", { n: 1 })).toBe("1 person")
    expect(t("members.header", { n: 3 })).toBe("3 people")
    expect(t("requests.badge.a11y", { n: 2 })).toBe("2 requests waiting on you")
  })
  it("splits title · body strings", () => {
    expect(tLines("preview.vote.over_cap", { k: 2, n: 3, instantLimit: "$100" })).toEqual([
      "This needs 2 of 3 approvals",
      "It's over the $100 instant limit.",
    ])
    expect(tLines("spend.checking")).toEqual(["Checking Pot rules…", null])
  })
  it("builds document titles", () => {
    expect(pageTitle("Lisbon Trip")).toBe("Lisbon Trip · Pot")
  })
})
