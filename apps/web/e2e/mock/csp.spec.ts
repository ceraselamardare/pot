// CLI-1 / APP-5 (security audit 2026-11-04): the Content-Security-Policy (lib/security/csp.ts, sent by next.config.ts)
// breaks nothing. Every main page, signed out and signed in, the sign-in dialog, the Approve sheet and the public
// pay-in page load on the mock data source with ZERO violations: a `securitypolicyviolation` listener installed before
// any script runs, plus the console's "Refused to …" lines (they also cover frames). The header itself is checked
// too: script-src without 'unsafe-eval', a connect-src allowlist with no wildcard.
// The real NEAR Connect picker and the NEAR Auth window need a live build (they never load in a mock build): see
// notes/frontend.md "Security fixes (2026-11-05)" for how they were checked.
import { expect, test, type Page } from "@playwright/test"
import { NO_STATE } from "../fixtures/onboarding"
import { asPerson, PORTO_INVITE_URL } from "../fixtures/pot"

// one phone and the desktop are enough: the policy doesn't depend on the colour scheme
test.beforeEach(({}, info) => test.skip(info.project.name === "mobile-night", "the policy is the same in Night"))

type Seen = { violations: string[]; console: string[] }

/** Collect CSP violations from the first script on (survives navigations: the init script runs on every document). */
async function watchCsp(page: Page): Promise<Seen> {
  const seen: Seen = { violations: [], console: [] }
  await page.exposeFunction("__cspViolation", (v: string) => seen.violations.push(v))
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      const w = window as unknown as { __cspViolation?: (v: string) => void }
      w.__cspViolation?.(
        `${e.effectiveDirective} blocked ${e.blockedURI || "(inline)"} on ${location.pathname}${e.sourceFile ? ` from ${e.sourceFile}:${e.lineNumber}` : ""}`,
      )
    })
  })
  page.on("console", (m) => {
    const text = m.text()
    if (/Content Security Policy|Refused to (load|execute|connect|frame|apply|evaluate|create)/i.test(text)) seen.console.push(text)
  })
  return seen
}

/** Load a page, let it settle (hydration, lazy chunks, prefetches), then expect nothing was refused. */
async function visit(page: Page, seen: Seen, path: string, ready?: (page: Page) => Promise<unknown>) {
  await page.goto(path)
  await page.waitForLoadState("networkidle")
  if (ready) await ready(page)
  await page.waitForTimeout(300)
  expect(seen.violations, `CSP violations on ${path}`).toEqual([])
  expect(seen.console, `CSP console errors on ${path}`).toEqual([])
}

test("the header: a full policy on every page, no eval, a tight connect-src", async ({ request }) => {
  for (const path of ["/", "/group-trip", "/bachelorette-party", "/group-gift", "/shared-account-with-friends", "/tools/group-trip-cost-calculator", "/pots", "/p/lisbon-trip", "/give/lisbon-trip", "/j/porto-weekend"]) {
    const csp = (await request.get(path)).headers()["content-security-policy"]!
    expect(csp, path).toContain("default-src 'self'")
    expect(csp, path).toMatch(/script-src 'self' 'unsafe-inline'(;|$)/)
    expect(csp, path).not.toContain("unsafe-eval")
    expect(csp, path).toContain("object-src 'none'")
    expect(csp, path).toContain("frame-ancestors 'none'")
    const connect = csp.split("; ").find((d) => d.startsWith("connect-src "))!
    expect(connect).toContain("'self'")
    expect(connect).not.toMatch(/\s(\*|https:|wss:|data:)(\s|$)/)
  }
  // the service worker keeps its own, stricter policy
  expect((await request.get("/sw.js")).headers()["content-security-policy"]).toBe("default-src 'self'; script-src 'self'")
})

test("signed out: the landing, the demo, the invite page, the public pages and the sign-in dialog", async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL, storageState: NO_STATE })
  const page = await ctx.newPage()
  const seen = await watchCsp(page)
  await visit(page, seen, "/")
  await visit(page, seen, "/demo")
  for (const ch of [1, 2, 3, 4, 5, 6]) await visit(page, seen, `/demo/${ch}`)
  await visit(page, seen, "/demo/all")
  await visit(page, seen, "/group-trip")
  await visit(page, seen, "/bachelorette-party")
  await visit(page, seen, "/group-gift")
  await visit(page, seen, "/shared-account-with-friends")
  await visit(page, seen, "/tools/group-trip-cost-calculator")
  await visit(page, seen, PORTO_INVITE_URL, (p) => expect(p.locator("[data-join-cta]")).toBeVisible())
  await visit(page, seen, "/give/lisbon-trip")
  await visit(page, seen, "/g/lisbon-trip/AAAAAAAAAAAAAAAAAAAAAA")
  await visit(page, seen, "/c/lisbon-trip/1")
  await visit(page, seen, "/p/lisbon-trip/record")
  // the sign-in dialog, opened in place from the landing's [Start a Pot] (the mock simulates its options; signs nothing)
  await visit(page, seen, "/", async (p) => {
    const hero = p.locator("[data-signin-source='hero']")
    await expect(hero).toHaveAttribute("data-opens-dialog", "true")
    await hero.click()
    await expect(p.getByRole("dialog", { name: "Sign in to start your Pot" })).toBeVisible()
  })
  // the app's signed-out screen (the same options inline)
  await visit(page, seen, "/pots", (p) => expect(p.getByRole("heading", { name: "Sign in to Pot" })).toBeVisible())
  await ctx.close()
})

test("signed in: Pots, a Pot, its sheets, the Approve sheet, Requests, You, Advanced and the record", async ({ page }) => {
  await asPerson(page, "maya")
  const seen = await watchCsp(page)
  await visit(page, seen, "/pots")
  await visit(page, seen, "/p/lisbon-trip")
  await visit(page, seen, "/p/lisbon-trip?sheet=add")
  await visit(page, seen, "/p/lisbon-trip?sheet=spend")
  await visit(page, seen, "/requests")
  // the first request waiting on Maya opens the Approve sheet
  await visit(page, seen, "/requests", async (p) => {
    const row = p.locator("[data-request-row], [data-request]").first()
    if (await row.count()) {
      await row.click()
      await expect(p.getByRole("dialog").first()).toBeVisible()
    }
  })
  // a spend's details (the Approve sheet, decided): Porto Weekend's seeded request
  await visit(page, seen, "/p/porto-weekend?r=11", (p) => expect(p.getByRole("dialog").first()).toBeVisible())
  await visit(page, seen, "/you")
  await visit(page, seen, "/you/advanced")
  await visit(page, seen, "/p/lisbon-trip/record")
  await visit(page, seen, "/give/lisbon-trip")
})
