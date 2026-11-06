// @vitest-environment jsdom
// The site footer (components/landing/home/SiteFooter.tsx): four labelled link groups, the registry's pages listed on
// their own, only real destinations, no marigold, external links that say where they go, and the Testnet badge.
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SiteFooter } from "@/components/landing/home/SiteFooter"
import en from "@/i18n/en.json"
import { footerPages, MARKETING_PAGES, useCasePages } from "@/lib/marketing/pages"
import { SITE } from "@/lib/marketing/site"

const m = en as Record<string, string>
afterEach(() => vi.unstubAllEnvs())

function footer() {
  const doc = new DOMParser().parseFromString(`<body>${renderToStaticMarkup(<SiteFooter />)}</body>`, "text/html")
  return doc.querySelector("footer")!
}

const groupLinks = (f: HTMLElement, id: string) =>
  [...f.querySelectorAll(`nav[aria-labelledby='${id}'] a`)].map((a) => ({ href: a.getAttribute("href"), text: a.textContent }))

describe("SiteFooter", () => {
  it("has four navs, each labelled by its heading", () => {
    const f = footer()
    const navs = [...f.querySelectorAll("nav")]
    expect(navs.map((n) => f.querySelector(`#${n.getAttribute("aria-labelledby")}`)?.textContent)).toEqual([
      m["footer.product.title"],
      m["footer.usecases.title"],
      m["footer.tools.title"],
      m["footer.built.title"],
    ])
  })

  it("Product: the home's story, the demo, and the start and sign-in links as plain text links", () => {
    expect(groupLinks(footer(), "footer-product")).toEqual([
      { href: "/#how", text: m["footer.product.how"] },
      { href: "/#rules", text: m["footer.product.rules"] },
      { href: "/demo", text: m["footer.product.demo"] },
      { href: "/pots?sheet=create", text: m["footer.product.start"] },
      { href: "/pots", text: m["footer.product.signin"] },
    ])
  })

  it("lists every registered use case and free tool, from the registry", () => {
    const f = footer()
    const { useCases, tools } = footerPages()
    expect(useCases.length + tools.length).toBe(useCasePages().length)
    expect(groupLinks(f, "footer-use-cases")).toEqual(useCases.map((p) => ({ href: p.path, text: m[p.useCase.navKey] })))
    expect(groupLinks(f, "footer-tools")).toEqual(tools.map((p) => ({ href: p.path, text: m[p.useCase.navKey] })))
    expect(tools.map((p) => p.path)).toContain("/tools/group-trip-cost-calculator")
    expect(useCases.map((p) => p.path)).toEqual(["/group-trip", "/bachelorette-party", "/group-gift", "/shared-account-with-friends"])
  })

  it("links only to registered pages, the home's sections, the app's entry and the repo", () => {
    const registered = new Set<string>(MARKETING_PAGES.map((p) => p.path))
    for (const a of footer().querySelectorAll("a")) {
      const href = a.getAttribute("href")!
      if (href.startsWith("https://")) expect(href.startsWith(SITE.repo), href).toBe(true)
      else if (href.startsWith("/#") || href === "#main") expect(["/#how", "/#rules", "/#tech", "#main"]).toContain(href)
      else if (href.startsWith("/pots")) expect(["/pots", "/pots?sheet=create"]).toContain(href)
      else expect(registered.has(href), href).toBe(true)
    }
  })

  it("external links: rel=noopener, an arrow icon, and a hidden 'on GitHub'", () => {
    const ext = [...footer().querySelectorAll("a[data-external]")]
    expect(ext.map((a) => a.getAttribute("href"))).toEqual([SITE.repo, `${SITE.repo}/blob/main/SECURITY.md`])
    for (const a of ext) {
      expect(a.getAttribute("rel")).toBe("noopener")
      expect(a.querySelector(".sr-only")?.textContent).toBe(m["footer.external"])
      expect(a.querySelector("svg")?.getAttribute("stroke-width")).toBe("2")
    }
  })

  it("no marigold anywhere, and the bottom row: copyright, maker, Back to top", () => {
    const f = footer()
    expect(f.outerHTML).not.toMatch(/\b(bg|text|border)-brand\b/)
    expect(f.querySelectorAll("[data-variant='primary']")).toHaveLength(0)
    expect(f.textContent).toContain(m["footer.copyright"])
    expect(f.textContent).toContain(m["footer.maker"])
    expect(f.querySelector("a[href='#main']")?.textContent).toBe(m["home.footer.top"])
  })

  it("keeps the Testnet badge on testnet builds only", () => {
    vi.stubEnv("NEXT_PUBLIC_NETWORK", "testnet")
    expect(footer().querySelector("button[data-network-badge='footer']")?.textContent).toBe(m["network.badge"])
    vi.stubEnv("NEXT_PUBLIC_NETWORK", "mainnet")
    expect(footer().querySelector("[data-network-badge]")).toBeNull()
  })
})
