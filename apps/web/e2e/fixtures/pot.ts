// Shared helpers for the mocked-UI tier (test-plan §5.1): the mock world's people, brand checks (M-20, M-22) and axe
// (M-13).
import { AxeBuilder } from "@axe-core/playwright"
import { expect, type Locator, type Page } from "@playwright/test"

export const BRAND = "rgb(255, 179, 32)"
export const BRAND_DEEP = ["rgb(184, 120, 0)", "rgb(227, 154, 0)"]

export const PORTO_INVITE_PK = "BYQrv4recka1ASkHNkAiZ4ZTSoAjp91824cnR15bRmok"
export const PORTO_INVITE_URL = `/j/porto-weekend?i=${PORTO_INVITE_PK}#BRAbJjE8R1JdaHN-iZSfqrXAy9bh7PcCDRgjLjlET1o`

export type MockPerson = "maya" | "sam" | "leo" | "alex"

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
    // a round action (components/pot/PotActions) is marigold through its circle: `[data-circle]` inside the button
    const fill = (el: Element) => {
      const circle = el.querySelector(":scope > [data-circle]")
      return getComputedStyle(circle ?? el).backgroundColor
    }
    return [...root.querySelectorAll('button, a, [role="button"]')].filter(
      (el) => visible(el) && !el.closest('[aria-hidden="true"], [inert]') && fill(el) === brand,
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

/**
 * The Pot's ••• More (the hero's action row, or the header's on a closed Pot) → the "More options" sheet. With
 * `item`, press that row of it (e.g. "Invite friends", /Ask for more money/, /Gifts/, "Pot record", /Who can see
 * what/, /Close Pot/, "See who got what"). Returns the More sheet.
 */
export async function potMore(page: Page, potName: string, item?: string | RegExp) {
  await page.getByRole("button", { name: `More options for ${potName}` }).click()
  const sheet = await openedSheet(page, "More options")
  if (item !== undefined) await sheet.getByRole("button", { name: item }).click()
  return sheet
}

/** Type an amount on the custom keypad inside a sheet. */
export async function typeAmount(page: Page, amount: string) {
  const dialog = page.getByRole("dialog")
  for (const ch of amount) await dialog.getByRole("button", { name: ch === "." ? "decimal point" : ch, exact: true }).click()
}

/** The Spend sheet's [Next]: step 1 "How much?" → step 2 "What's it for?". */
export async function spendNext(page: Page) {
  const dialog = page.getByRole("dialog")
  await dialog.getByRole("button", { name: "Next", exact: true }).click()
  await expect(dialog.locator("[data-spend-body='2']")).toBeVisible()
  return dialog
}

/** The Spend sheet's ⓘ: open the why under the decision line (the rule, trust, what you'd get back). */
export async function spendWhy(page: Page) {
  const line = page.getByRole("dialog").locator("[data-decision]")
  const more = line.getByRole("button", { name: "Why: more about this" })
  if ((await more.getAttribute("aria-expanded")) !== "true") await more.click()
  return line.locator("[data-decision-why]")
}

/**
 * The Spend sheet in its two steps (open it first): type `amount` on step 1 (omit it when it's typed already), [Next], then on step 2 pick the reason
 * (a chip name, e.g. "Groceries") and who gets paid ("Me" | "A member" | "Someone else", + `member` by name), and
 * press `submit` (the ask's name, e.g. "Get $84 back") when given. Returns the dialog, on step 2 (or its result).
 */
export async function spendFlow(
  page: Page,
  o: { amount?: string; reason?: string; payee?: "Me" | "A member" | "Someone else"; member?: string; submit?: string | RegExp },
) {
  if (o.amount) await typeAmount(page, o.amount)
  const sheet = await spendNext(page)
  if (o.reason) await sheet.getByRole("button", { name: new RegExp(o.reason) }).click()
  if (o.payee) await sheet.getByRole("radio", { name: o.payee, exact: true }).click()
  if (o.member) await sheet.getByRole("radiogroup", { name: "Who gets the money?" }).getByRole("radio", { name: o.member }).click()
  if (o.submit) await sheet.getByRole("button", { name: o.submit }).click()
  return sheet
}

/** The Add money sheet's [Next]: step 1 "How much?" → step 2 "How do you want to add it?" (&step=source). */
export async function addNext(page: Page) {
  const dialog = page.getByRole("dialog")
  await dialog.getByRole("button", { name: "Next", exact: true }).click()
  await expect(dialog.locator("[data-add-body='2']")).toBeVisible()
  return dialog
}

/**
 * The Add money sheet in its two steps (open it first): type `amount` on step 1 and press [Next] (omit `amount` when
 * the sheet already shows step 2, e.g. a link with ?amount=, or when the amount on step 1 is fine as it is: then
 * `next: true`), pick `source` on step 2 ("Demo dollars" | "Pot dollars" | "Another app or exchange"), and press
 * `submit` when given (e.g. "Add $50", or "Continue" for another app). Returns the dialog.
 */
export async function addFlow(
  page: Page,
  o: { amount?: string; next?: boolean; source?: "Demo dollars" | "Pot dollars" | "Another app or exchange"; submit?: string | RegExp },
) {
  const dialog = page.getByRole("dialog")
  if (o.amount) await typeAmount(page, o.amount)
  if (o.amount || o.next) await addNext(page)
  await expect(dialog.locator("[data-add-body='2']")).toBeVisible()
  if (o.source) await dialog.getByRole("radio", { name: new RegExp(`^${o.source}`) }).click()
  if (o.submit) await dialog.getByRole("button", { name: o.submit, exact: typeof o.submit === "string" }).click()
  return dialog
}

/**
 * Create a Pot on the one Create screen (lean create; open it first, e.g. "Start a Pot"): type `name`, pick `emoji`
 * and/or `colour` (1-6) on the cover's picker, and press [Create Pot]. With `rules`, press the summary's [Change]
 * first and edit the full "Pot rules" step in the callback (it gets that dialog), then create from there.
 * `submit: false` stops before [Create Pot]. Returns the dialog [Create Pot] is (or would be) pressed on.
 */
export async function createPot(
  page: Page,
  o: { name: string; emoji?: string; colour?: number; rules?: (rules: Locator) => Promise<void>; submit?: boolean },
): Promise<Locator> {
  const main = page.getByRole("dialog", { name: "Start a Pot" })
  await expect(main).toBeVisible()
  await main.getByRole("textbox", { name: /Pot name/ }).fill(o.name)
  if (o.emoji || o.colour) {
    await main.getByRole("button", { name: "Change the emoji and colour" }).click()
    if (o.emoji) await main.getByRole("radio", { name: o.emoji }).click()
    if (o.colour) await main.getByRole("radio", { name: `Colour ${o.colour}` }).click()
    await main.getByRole("button", { name: "Done" }).click()
  }
  let at = main
  if (o.rules) {
    await main.getByRole("button", { name: "Change the rules" }).click()
    at = page.getByRole("dialog", { name: "Pot rules" })
    await expect(at).toBeVisible()
    await o.rules(at)
  }
  if (o.submit !== false) await at.getByRole("button", { name: "Create Pot" }).click()
  return at
}
