// U-WEB-09 (test-plan §3.2, rev6, D-67): brand drift and token contrast.
//   (a) app/tokens.css equals a fresh gen-tokens.mjs run on tokens.json;
//   (b) the public/ icons and og-image are byte-identical (sha256) to brand/web;
//   (c) WCAG contrast pairs computed from tokens.json, Day and Night.
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { OUT_FILE, WEB_DIR, findBrandDir, generateTokensCss, readTokens } from "./gen-tokens.mjs"

const { tokens, source } = readTokens()
const THEMES = ["day", "night"] as const
type Theme = (typeof THEMES)[number]

function color(name: string, theme: Theme): string {
  const t = tokens.color.tokens.find((x: { name: string }) => x.name === name)
  if (!t) throw new Error(`unknown token ${name}`)
  return t.value[theme]
}

// WCAG 2.x relative luminance and contrast ratio
function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

describe("U-WEB-09 brand drift", () => {
  it("(a) app/tokens.css is generated from tokens.json and up to date", () => {
    expect(readFileSync(OUT_FILE, "utf8")).toBe(generateTokensCss(tokens, source))
  })

  it.each([
    "favicon.ico",
    "favicon.svg",
    "apple-touch-icon.png",
    "icon-192.png",
    "icon-512.png",
    "icon-maskable-512.png",
    "og-image.png",
  ])("(b) public/%s is byte-identical to the brand file", (file) => {
    const sha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex")
    expect(sha(join(WEB_DIR, "public", file))).toBe(sha(join(findBrandDir(), "web", file)))
  })
})

describe.each(THEMES)("U-WEB-09 (c) token contrast, %s", (theme) => {
  const c = (name: string) => color(name, theme)
  const surfaces = ["ground", "surface", "surface-sunken"]

  it.each(["ink", "ink-muted", "link", "approved", "waiting", "declined"])(
    "%s >= 4.5:1 on ground, surface and surface-sunken",
    (fg) => {
      for (const bg of surfaces) expect(contrast(c(fg), c(bg)), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)
    },
  )

  it("on-brand on brand >= 4.5:1; ink and ink-muted on brand-soft >= 4.5:1", () => {
    expect(contrast(c("on-brand"), c("brand"))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(c("ink"), c("brand-soft"))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(c("ink-muted"), c("brand-soft"))).toBeGreaterThanOrEqual(4.5)
  })

  it("line-strong >= 3:1 on every surface; focus >= 3:1 on ground and surface", () => {
    for (const bg of surfaces) expect(contrast(c("line-strong"), c(bg)), bg).toBeGreaterThanOrEqual(3)
    for (const bg of ["ground", "surface"]) expect(contrast(c("focus"), c(bg)), bg).toBeGreaterThanOrEqual(3)
  })

  it("on-brand initials >= 4.5:1 on member-1...member-6", () => {
    for (let i = 1; i <= 6; i++) {
      expect(contrast(c("on-brand"), c(`member-${i}`)), `member-${i}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  if (theme === "day") {
    it("Day brand-deep (the marigold button border) >= 3:1 on ground", () => {
      expect(contrast(c("brand-deep"), c("ground"))).toBeGreaterThanOrEqual(3)
    })
  }
})
