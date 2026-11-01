// Review screenshots of the live Pot (notes/screens/live-{day,night}-pot.png), read-only: it reuses the demo
// lease the judge spec (demo.testnet.ts) saved, switches to Maya (a demo session, no transaction) and shoots the
// Pot screen after the README steps ran on it. Run it after demo.testnet.ts.
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, test } from "@playwright/test"

const SCREENS = fileURLToPath(new URL("../../../../notes/screens/", import.meta.url))
const VISITOR = fileURLToPath(new URL("../../test-results/testnet-demo-visitor.json", import.meta.url))

test("live Pot screenshots, Day and Night", async ({ browser }) => {
  test.skip(!existsSync(VISITOR), "run demo.testnet.ts first (it leases the demo Pot)")
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  await ctx.addCookies(JSON.parse(readFileSync(VISITOR, "utf8")))
  const page = await ctx.newPage()
  await page.goto("/demo?as=maya")
  await expect(page).toHaveURL(/\/p\/[a-z0-9-]+$/, { timeout: 30_000 })
  await expect(page.locator("[data-hero] [data-money]").first()).toBeVisible({ timeout: 30_000 })
  await expect(page.locator("[data-feed] li", { hasText: "Maya got $20 back for groceries" }).first()).toBeVisible({ timeout: 30_000 })
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${SCREENS}live-${scheme === "dark" ? "night" : "day"}-pot.png` })
  }
  await ctx.close()
})
