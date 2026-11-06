// @vitest-environment jsdom
// The Testnet badge (components/brand/NetworkBadge.tsx): only on a `testnet` build, a real button that opens its
// explanation as a native popover (no JS), an icon and a word, neutral (never marigold), unique ids per place.
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"
import { NetworkBadge } from "@/components/brand/NetworkBadge"
import en from "@/i18n/en.json"
import { findBanned, isAllowlisted } from "@/i18n/banned.mjs"
import { isTestnetBuild } from "@/lib/network"

const m = en as Record<string, string>
afterEach(() => vi.unstubAllEnvs())

describe("isTestnetBuild", () => {
  it("is true only for an explicit testnet build", () => {
    expect(isTestnetBuild("testnet")).toBe(true)
    for (const n of ["mainnet", "", undefined, "Testnet", "localnet"]) expect(isTestnetBuild(n)).toBe(false)
  })
  it("reads NEXT_PUBLIC_NETWORK by default", () => {
    vi.stubEnv("NEXT_PUBLIC_NETWORK", "testnet")
    expect(isTestnetBuild()).toBe(true)
    vi.stubEnv("NEXT_PUBLIC_NETWORK", "mainnet")
    expect(isTestnetBuild()).toBe(false)
  })
})

describe("NetworkBadge", () => {
  it("renders nothing when the network isn't testnet", () => {
    for (const n of ["mainnet", ""]) {
      vi.stubEnv("NEXT_PUBLIC_NETWORK", n)
      expect(renderToStaticMarkup(<NetworkBadge place="header" />)).toBe("")
    }
  })

  it("on testnet: a button that opens its explanation as a native popover, an icon and the word", () => {
    vi.stubEnv("NEXT_PUBLIC_NETWORK", "testnet")
    const doc = new DOMParser().parseFromString(`<body>${renderToStaticMarkup(<NetworkBadge place="footer" />)}</body>`, "text/html")
    const button = doc.querySelector("button[data-network-badge='footer']")!
    expect(button.getAttribute("type")).toBe("button")
    expect(button.textContent).toBe(m["network.badge"])
    expect(button.querySelector("svg")?.getAttribute("stroke-width")).toBe("2")
    expect(button.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true")
    // the explanation is the button's popover target and comes right after it (screen readers read it next)
    const pop = doc.getElementById(button.getAttribute("popovertarget")!)!
    expect(pop.getAttribute("popover")).toBe("auto")
    expect(button.nextElementSibling).toBe(pop)
    expect(pop.textContent).toContain(m["network.badge.title"])
    expect(pop.textContent).toContain(m["network.badge.body"])
    // neutral: never the marigold fill or marigold text
    expect(`${button.className} ${pop.className}`).not.toMatch(/\b(bg|text|border)-brand\b/)
  })

  it("gives each place its own popover id and anchor", () => {
    vi.stubEnv("NEXT_PUBLIC_NETWORK", "testnet")
    const html = renderToStaticMarkup(
      <>
        <NetworkBadge place="header" />
        <NetworkBadge place="footer" />
      </>,
    )
    expect(html).toContain('id="network-badge-header"')
    expect(html).toContain('id="network-badge-footer"')
    expect(html).toContain("--pot-netbadge-header")
    expect(html).toContain("--pot-netbadge-footer")
  })

  it("its words are the only exempt ones: exact keys in banned.mjs, nothing else under network.*", () => {
    const keys = Object.keys(m).filter((k) => k.startsWith("network."))
    expect(keys.sort()).toEqual(["network.badge", "network.badge.body", "network.badge.title"])
    for (const k of keys) expect(isAllowlisted(k), k).toBe(true)
    expect(findBanned(m["network.badge"]!)).toBe("Testnet") // banned everywhere else
    expect(isAllowlisted("network.other")).toBe(false)
  })
})
