// Shared helpers for the mocked-UI tier (test-plan §5.1): the mock world's people, brand checks (M-20, M-22) and axe
// (M-13).
import { AxeBuilder } from "@axe-core/playwright"
import { expect, type Page } from "@playwright/test"

export const BRAND = "rgb(255, 179, 32)"
export const BRAND_DEEP = ["rgb(184, 120, 0)", "rgb(227, 154, 0)"]

export const PORTO_INVITE_PK = "BYQrv4recka1ASkHNkAiZ4ZTSoAjp91824cnR15bRmok"
export const PORTO_INVITE_URL = `/j/porto-weekend?i=${PORTO_INVITE_PK}#BRAbJjE8R1JdaHN-iZSfqrXAy9bh7PcCDRgjLjlET1o`

export type MockPerson = "maya" | "sam" | "leo"

/** Sign in as one of the mock world's people (the mock session) before the first page load; later switches stick. */
export async function asPerson(page: Page, person: MockPerson) {
  await page.addInitScript((p) => {
    if (!localStorage.getItem("pot.mock.session")) localStorage.setItem("pot.mock.session", JSON.stringify({ persona: p, kind: "mock" }))
  }, person)
}

/** Become another of the mock world's people on the same page (the app has no person switcher since Rev 9). */
export async function becomePerson(page: Page, person: MockPerson) {
  await page.evaluate((p) => localStorage.setItem("pot.mock.session", JSON.stringify({ persona: p, kind: "mock" })), person)
  await page.reload()
}

/** The open dialog, if any (sheets are modal: the page under them is inert). */
export async function marigoldButtons(page: Page): Promise<number> {
  return page.evaluate((brand) => {
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect()
      const s = getComputedStyle(el)
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && Number(s.opacity) > 0
    }
    const dialog = [...document.querySelectorAll('[role="dialog"]')].find(visible)
    const root = dialog ?? document.body
    return [...root.querySelectorAll('button, a, [role="button"]')].filter(
      (el) => visible(el) && !el.closest('[aria-hidden="true"], [inert]') && getComputedStyle(el).backgroundColor === brand,
    ).length
  }, BRAND)
}

/** M-20: marigold (brand, brand-deep) is never the colour of text. */
export async function marigoldText(page: Page): Promise<string[]> {
  return page.evaluate((colors) => {
    const out: string[] = []
    for (const el of document.querySelectorAll("body *")) {
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim())
      if (!own) continue
      if (colors.includes(getComputedStyle(el).color)) out.push(`${el.tagName}: ${el.textContent?.trim().slice(0, 40)}`)
    }
    return out
  }, [BRAND, ...BRAND_DEEP])
}

/** M-22: every amount has tabular figures; M-20: every status chip is icon + word. */
export async function brandChecks(page: Page, opts: { marigold: "one" | "at-most-one" | "none" }) {
  await page.waitForTimeout(250) // a just-enabled button is still in its 120 ms colour transition
  const n = await marigoldButtons(page)
  if (opts.marigold === "one") expect(n, "exactly one marigold button").toBe(1)
  else if (opts.marigold === "none") expect(n, "no marigold button").toBe(0)
  else expect(n, "at most one marigold button").toBeLessThanOrEqual(1)
  expect(await marigoldText(page)).toEqual([])
  const money = await page.locator("[data-money]").evaluateAll((els) =>
    els.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => getComputedStyle(e).fontVariantNumeric),
  )
  for (const v of money) expect(v).toContain("tabular-nums")
  const chips = await page.locator("[data-status]").evaluateAll((els) =>
    els.map((e) => ({ svg: !!e.querySelector("svg"), word: (e.textContent ?? "").trim().length > 0 })),
  )
  for (const c of chips) expect(c).toEqual({ svg: true, word: true })
}

/** M-13: axe WCAG 2.2 AA, no serious or critical violations. */
export async function axe(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")
  expect(serious, JSON.stringify(serious.map((v) => [v.id, v.nodes.map((n) => n.target).slice(0, 4)]), null, 2)).toEqual([])
}

export async function openedSheet(page: Page, name: string | RegExp) {
  const dialog = page.getByRole("dialog", { name })
  await expect(dialog).toBeVisible()
  await page.waitForTimeout(450) // let the 360 ms enter transition finish before measuring colours
  return dialog
}

/** Type an amount on the custom keypad inside a sheet. */
export async function typeAmount(page: Page, amount: string) {
  const dialog = page.getByRole("dialog")
  for (const ch of amount) await dialog.getByRole("button", { name: ch === "." ? "decimal point" : ch, exact: true }).click()
}
