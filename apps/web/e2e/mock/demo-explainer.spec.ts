// The /demo tour (plan/design-direction/06 §1.3, §8.4; README J-1…J-5): a cover, 14 steps in 5 parts and an end
// screen. The walk with Next and with the phone's own primary, at most one marigold in every state, the 1.2 s rules
// check and exactly one burst on step 7, the persona chips, the pushes on 10 and 13, Back, Skip, the keyboard and
// focus, the live region, the end's [Start a real Pot] (the sign-in link: signed out it opens the sign-in dialog,
// and ←/→ leave the tour alone under it), today's rules on the phone (one-screen Create; the $300 tickets need one
// OK), deep links (old /demo/N and #beat-k too), the optional
// "Under the hood" sheet (Night, the decoded cards, real testnet links, the glossary), the stage fitting one
// viewport, axe, and no network at all (nothing is signed or sent). Runs in mobile-day, mobile-night and desktop on
// the mock build. Selectors are the tour's data-* hooks; copy comes from en.json, step data from tour.ts.
import { readFileSync } from "node:fs"
import { expect, test, type Page } from "@playwright/test"
import { findBanned } from "../../i18n/banned.mjs"
import { stepForLegacyBeat, stepsOfPart, TOUR, TOUR_CHAPTER_START, TOUR_COVER, TOUR_END, TOUR_PARTS, TOUR_STATES } from "../../components/demo/tour"
import { axe, brandChecks, marigoldButtons } from "../fixtures/pot"

const read = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"))
const en = read("../../i18n/en.json") as Record<string, string>
const script = read("../../app/demo/_data/demo-script.json") as { chapters: { n: number; real: { hash: string }[] }[] }
const realOf = (part: number) => TOUR_PARTS[part - 1]!.chapters.flatMap((n) => script.chapters.find((c) => c.n === n)!.real.map((r) => r.hash))
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_m, k) => String(v[k]))
const NAME = { maya: "Maya", sam: "Sam", leo: "Leo" } as const

const FORBIDDEN = /fastnear|drpc|nearblocks\.io|\/api\/relay|\/api\/demo/
let requests: string[] = []

test.beforeEach(async ({ page }) => {
  // nothing is sent: no RPC, no relayer, no demo API (the real-tx links are only followed by a click)
  requests = []
  page.on("request", (r) => {
    if (FORBIDDEN.test(r.url())) requests.push(r.url())
  })
  // count every burst that mounts (the brand's one celebration)
  await page.addInitScript(() => {
    const w = window as unknown as { __bursts: number }
    w.__bursts = 0
    new MutationObserver((ms) => {
      for (const m of ms)
        for (const n of m.addedNodes) if (n instanceof Element && (n.matches("[data-celebration]") || n.querySelector("[data-celebration]"))) w.__bursts++
    }).observe(document, { subtree: true, childList: true })
  })
})

test.afterEach(() => {
  expect(requests, "the demo made a network request").toEqual([])
})

const stage = (page: Page) => page.locator("[data-tour-stage]")
const nextBtn = (page: Page) => page.locator("[data-tour-next]")
const phone = (page: Page) => page.locator("[data-tour-stage] [data-tour-phone]")
const primary = (page: Page) => page.locator("[data-tour-stage] [data-phone-primary]")
const hoodSheet = (page: Page) => page.getByRole("dialog")
const bursts = (page: Page) => page.evaluate(() => (window as unknown as { __bursts: number }).__bursts)

/** The stage shows state `n` and is hydrated (the server HTML is always the cover, with links for buttons). */
async function at(page: Page, n: number) {
  await expect(stage(page)).toHaveAttribute("data-state", String(n))
  await expect(page.locator("button[data-tour-skip], button[data-tour-hood-trigger]").first()).toBeAttached()
}

/** A fresh load of `url` (a goto that only changes the fragment would keep the document). */
async function open(page: Page, url: string, n: number) {
  await page.goto("about:blank")
  await page.goto(url)
  await at(page, n)
}

/** One move forward: [Show me how] on the cover; the phone's own primary on a tap step (`phone`); else Next. */
async function forward(page: Page, how: "next" | "phone" = "next") {
  const s = Number(await stage(page).getAttribute("data-state"))
  if (s === TOUR_COVER) await page.locator("button[data-tour-start]").click()
  else if (how === "phone" && TOUR[s - 1]!.tap) await primary(page).click()
  else {
    await expect(nextBtn(page)).not.toHaveAttribute("aria-disabled", "true")
    await nextBtn(page).click()
  }
  await at(page, s + 1)
}

/** The stage's visible text and accessible names say no banned word (S4): product words only on the main path. */
async function jargonFree(page: Page, label: string) {
  const text = await stage(page).evaluate((el) => {
    const names = [...el.querySelectorAll("[aria-label]")].map((e) => e.getAttribute("aria-label"))
    // the Testnet badge is the one exempt word (banned.mjs ALLOW_KEYS: network.badge*): it names the network on purpose
    const badge = el.querySelector<HTMLElement>("[data-network-badge]")
    const text = (el as HTMLElement).innerText.replace(badge?.innerText ?? "\u0000", "")
    return [text, ...names].join("\n")
  })
  expect(findBanned(text), `${label}: a banned word on the main path`).toBeNull()
}

/** Everything the state needs is inside the viewport, nothing scrolls, nothing overlaps (S6). */
async function fits(page: Page, label: string) {
  const problems = await page.evaluate(() => {
    const out: string[] = []
    const vw = window.innerWidth
    const vh = window.innerHeight
    if (window.scrollY !== 0) out.push(`scrollY ${window.scrollY}`)
    const de = document.documentElement
    if (de.scrollHeight > vh + 1) out.push(`the page is ${de.scrollHeight} px tall`)
    if (de.scrollWidth > vw) out.push(`the page is ${de.scrollWidth} px wide`)
    const s = document.querySelector<HTMLElement>("[data-tour-stage]")!
    const mode = s.dataset.mode
    const need: Record<string, string[]> = {
      cover: ["[data-tour-title]", "[data-tour-start]", "[data-tour-phone]", "[data-tour-sim]"],
      step: ["[data-tour-you]", "[data-tour-part]", "[data-tour-progress]", "[data-tour-caption]", "[data-tour-phone]", "[data-tour-back]", "[data-tour-next]", "[data-tour-hood-trigger]"],
      end: ["[data-tour-title]", "[data-tour-cta]", "[data-tour-home]", "[data-tour-hood-trigger]"],
    }
    const box = (sel: string) => {
      const e = s.querySelector(sel)
      const r = e?.getBoundingClientRect()
      return r && r.width > 0 && r.height > 0 ? r : null
    }
    for (const sel of need[mode!]!) {
      const r = box(sel)
      if (!r) out.push(`${sel} is not shown`)
      else if (r.top < -0.5 || r.left < -0.5 || r.bottom > vh + 0.5 || r.right > vw + 0.5) out.push(`${sel} is outside the viewport (${Math.round(r.top)}…${Math.round(r.bottom)} of ${vh})`)
    }
    const ph = box("[data-tour-phone]")
    for (const sel of ["[data-tour-caption]", "[data-tour-next]", "[data-tour-back]", "[data-tour-start]", "[data-tour-cta]", "[data-tour-hood-trigger]"]) {
      const r = box(sel)
      if (ph && r && r.left < ph.right - 0.5 && r.right > ph.left + 0.5 && r.top < ph.bottom - 0.5 && r.bottom > ph.top + 0.5) out.push(`${sel} overlaps the phone`)
    }
    return out
  })
  expect(problems, label).toEqual([])
}

/** What every state must be (S4, S5, S7 and the strip). `sims` counts the states that say "This is a simulation". */
async function checkState(page: Page, n: number, sims: { n: number }) {
  const label = `state ${n}`
  if (n === TOUR_COVER || n === TOUR_END) await brandChecks(page, { marigold: "one" })
  else expect(await marigoldButtons(page), label).toBeLessThanOrEqual(1)
  await jargonFree(page, label)
  if (await page.locator("[data-tour-sim]").locator("visible=true").count()) sims.n++
  const trigger = page.locator("[data-tour-hood-trigger]")
  if (await trigger.count()) await expect(trigger).toHaveAttribute("aria-expanded", "false")
  const step = TOUR[n - 1]
  if (!step) return
  await expect(page.locator("[data-tour-you]")).toHaveAttribute("data-tour-you", step.you)
  await expect(page.locator("[data-tour-you]")).toContainText(fill(en["tour.you"]!, { name: NAME[step.you] }))
  await expect(page.locator("[data-tour-part]")).toHaveAttribute("data-tour-part", String(step.part))
  await expect(page.locator("[data-tour-progress]")).toHaveAttribute("aria-valuenow", String(n))
  await expect(page.locator("[data-tour-caption]")).toHaveText(en[step.captionKey]!)
  await expect(nextBtn(page)).toHaveText(n === TOUR.length ? en["tour.finish"]! : en["tour.next"]!)
  if (n === 1) await expect(page.locator("[data-tour-back]")).toBeDisabled()
  else await expect(page.locator("[data-tour-back]")).toBeEnabled()
}

/** The D-61 numbers on the phone (06 §8.4 J-1), with today's rules: Create is one screen, and the $300 tickets need
 *  one OK (site update, 2026-11-03). */
const PHONE_SAYS: Record<number, string[]> = {
  1: [en["create.title"]!, en["create.goal.inline"]!, fill(en["create.summary.instant"]!, { instantLimit: "$100" }), en["create.cta"]!],
  4: ["You're in!"],
  5: ["$450.00"],
  7: ["Approved by Pot rules", "$366.00"],
  8: [en["preview.one_ok.over_cap"]!.split(" · ")[0]!, en["spend.cta.one_ok"]!],
  9: [en["feed.pending.one_ok"]!, "$366.00"],
  10: [fill(en["approve.cta.ok"]!, { amount: "$300" })],
  11: [fill(en["approve.ok.done"]!, { amount: "$300", name: "Maya" }), "$66.00"],
  14: ["$22.00"],
}

/**
 * The end's [Start a real Pot] is the site's start action (a SignInLink, design-direction 07 §1.2): a real link to
 * Create for no-JS and new tabs; signed out, a click opens the sign-in dialog in place. The tour stays on its end
 * under it: ←/→ never move it, even with focus outside the dialog (NEAR Connect stacks its own picker on top), and
 * Escape brings the end back as it was. (Signing in from it is e2e/mock/signin.spec.ts.)
 */
async function startRealPot(page: Page) {
  const cta = page.locator("[data-tour-cta]")
  await expect(cta).toHaveText(en["tour.end.cta"]!)
  await expect(cta).toHaveAttribute("href", "/pots?sheet=create")
  const url = page.url()
  await cta.click()
  const panel = page.locator("[role='dialog'] [data-signin-panel]")
  await expect(panel).toBeVisible()
  await brandChecks(page, { marigold: "at-most-one" })
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  for (const k of ["ArrowLeft", "ArrowRight"]) await page.keyboard.press(k)
  await expect(stage(page)).toHaveAttribute("data-state", String(TOUR_END))
  await page.keyboard.press("Escape")
  await expect(panel).toHaveCount(0)
  await expect(stage(page)).toHaveAttribute("data-state", String(TOUR_END))
  // back where it was opened (/demo#end, or /demo/6#end)
  await expect(page).toHaveURL(url)
}

/** The whole tour, cover to end, checking every state; the D-61 numbers on the phone as they come. */
async function walkAll(page: Page, how: "next" | "phone", extra?: (n: number) => Promise<void>) {
  const sims = { n: 0 }
  const you: string[] = []
  for (let n = TOUR_COVER; n <= TOUR_END; n++) {
    await checkState(page, n, sims)
    if (TOUR[n - 1]) you.push(TOUR[n - 1]!.you)
    for (const s of PHONE_SAYS[n] ?? []) await expect(phone(page)).toContainText(s)
    await extra?.(n)
    if (n < TOUR_END) await forward(page, how)
  }
  return { sims: sims.n, you }
}

const runs = (xs: string[]) => xs.filter((x, i) => x !== xs[i - 1])

test("J-1: /demo → Show me how → every step with Next → Start a real Pot", async ({ page }) => {
  test.setTimeout(90_000)
  await open(page, "/demo", TOUR_COVER)
  expect(TOUR_STATES).toBe(16)
  await expect(page.locator("[data-tour-title]")).toHaveText(en["tour.cover.title"]!)
  // the old explainer's hooks are gone: no chapter rail, no tabs, no beat counter
  await expect(page.locator("[data-beat-step], [data-beat-next], [data-rail], [data-start], [role='tablist']")).toHaveCount(0)
  const { sims, you } = await walkAll(page, "next", async (n) => {
    await fits(page, `state ${n}`)
    // the hood is optional: no state opens it (S7)
    await expect(hoodSheet(page)).toHaveCount(0)
  })
  // who holds the phone: Maya → Leo → Maya → Leo (the push) → Maya → Sam (the push)
  expect(you).toEqual(TOUR.map((s) => s.you))
  expect(runs(you)).toEqual(["maya", "leo", "maya", "leo", "maya", "sam"])
  // "This is a simulation" is said once (S8)
  expect(sims).toBe(1)
  expect(await bursts(page)).toBe(1)
  // the end: one marigold, [Start a real Pot] → sign in (then Create), and a quiet way home
  await expect(page.locator("[data-tour-title]")).toHaveText(en["tour.end.title"]!)
  await expect(page.locator("[data-tour-skip]")).toHaveCount(0)
  await expect(page.locator("[data-tour-home]")).toHaveAttribute("href", "/")
  expect(page.url()).toMatch(/\/demo#end$/)
  await startRealPot(page)
})

test("J-2: the phone's own buttons walk the tour too; steps 5 and 14 have none", async ({ page }) => {
  test.setTimeout(90_000)
  await open(page, "/demo", TOUR_COVER)
  await walkAll(page, "phone", async (n) => {
    const step = TOUR[n - 1]
    if (!step) return
    if (step.tap) {
      // the phone's primary is the screen's one marigold and does what Next does (after the push on 10 and 13)
      await expect(primary(page)).toBeVisible()
      await expect(primary(page)).toHaveAttribute("aria-describedby", /.+/)
      await brandChecks(page, { marigold: "one" })
    } else {
      await expect(primary(page)).toHaveCount(0)
      await brandChecks(page, { marigold: "none" })
    }
  })
  await expect(page.locator("[data-tour-cta]")).toHaveAttribute("href", "/pots?sheet=create")
})

test("J-3: step 7, $84 of groceries approved by Pot rules: the 1.2 s check, then exactly one burst", async ({ page }) => {
  const seven = TOUR.find((s) => s.burst)!
  expect(seven.n).toBe(7)
  expect(seven.hold).toBe(true)
  await open(page, "/demo/4", TOUR_CHAPTER_START[4])
  await expect(page.locator("[data-tour-caption]")).toHaveText(en["tour.s6"]!)
  await expect(phone(page)).toContainText("Get $84 back")
  await expect(page.locator("[data-celebration]")).toHaveCount(0)
  // time how long Next stays aria-disabled
  await page.evaluate(() => {
    const w = window as unknown as { __hold: { on: boolean; t: number }[] }
    w.__hold = []
    new MutationObserver(() => {
      const on = document.querySelector("[data-tour-next]")?.getAttribute("aria-disabled") === "true"
      if (w.__hold.at(-1)?.on !== on) w.__hold.push({ on, t: performance.now() })
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-disabled"] })
  })
  await primary(page).click()
  await at(page, 7)
  await expect(nextBtn(page)).toHaveAttribute("aria-disabled", "true")
  await expect(phone(page)).toContainText("Checking Pot rules")
  await expect(page.locator("[data-tour-live]")).toHaveText("")
  // the caption waits with the phone: it never announces the approval during the check
  await expect(page.locator("[data-tour-caption]")).toHaveText(en["tour.s7.checking"]!)
  // Next and → do nothing while the rules are checked
  await nextBtn(page).dispatchEvent("click")
  await page.keyboard.press("ArrowRight")
  await expect(stage(page)).toHaveAttribute("data-state", "7")
  // approved, with the one burst; then sent, the Pot rolling to $366.00
  await expect(phone(page)).toContainText("Approved by Pot rules")
  await expect(page.locator("[data-celebration]")).toBeAttached()
  await expect(nextBtn(page)).not.toHaveAttribute("aria-disabled", "true")
  await expect(page.locator("[data-tour-caption]")).toHaveText(en["tour.s7"]!)
  await expect(phone(page)).toContainText("$84 sent to you")
  await expect(phone(page)).toContainText("$366.00")
  const hold = await page.evaluate(() => (window as unknown as { __hold: { on: boolean; t: number }[] }).__hold)
  const on = hold.find((h) => h.on)!
  const off = hold.find((h) => !h.on && h.t > on.t)!
  expect(off.t - on.t, "Next held for the rules check").toBeGreaterThanOrEqual(1190)
  expect(await bursts(page)).toBe(1)
  // the live region speaks only now, after the hold
  await expect(page.locator("[data-tour-live]")).toContainText(en["tour.s7"]!)
  await brandChecks(page, { marigold: "at-most-one" })
  // on to part 4: no second burst
  await forward(page)
  await expect(page.locator("[data-celebration]")).toHaveCount(0)
  expect(await bursts(page)).toBe(1)
})

test("taps: a visible hint on the first tap step until the phone is used; an inert tap rings the way on", async ({ page }) => {
  await open(page, "/demo", TOUR_COVER)
  await forward(page)
  const hint = page.locator("[data-tour-tap-hint]")
  await expect(hint).toHaveText(en["tour.tap_hint"]!)
  // only there: Next leaves it behind, Back brings it back
  await forward(page)
  await expect(hint).toHaveCount(0)
  await page.locator("[data-tour-back]").click()
  await at(page, 1)
  await expect(hint).toBeVisible()
  // the phone's own button: gone for good
  await forward(page, "phone")
  await page.locator("[data-tour-back]").click()
  await at(page, 1)
  await expect(hint).toHaveCount(0)
  // the share sheet's [Share link], a result screen's [Done]: a person taps them, so they go on
  await forward(page, "phone")
  await at(page, 2)
  await expect(primary(page)).toHaveText(/Share link/)
  // a tap on something inert in the phone does nothing in the story, it rings the way on
  await open(page, "/demo#step-5", 5)
  await phone(page).getByText("Add money").click({ force: true })
  await expect(stage(page)).toHaveAttribute("data-state", "5")
  await expect(stage(page)).toHaveAttribute("data-poke-to", "next")
  await open(page, "/demo#step-10", 10)
  await phone(page).getByText(en["approve.cta.decline"]!).click({ force: true })
  await expect(stage(page)).toHaveAttribute("data-state", "10")
  await expect(stage(page)).toHaveAttribute("data-poke-to", "phone")
})

test("J-4: part 4, the $300 boat tickets need one OK: Leo's push and his OK on steps 10-11; Sam's push on step 13", async ({ page }) => {
  expect(TOUR.filter((s) => s.push).map((s) => s.n)).toEqual([10, 13])
  await open(page, "/demo/5", TOUR_CHAPTER_START[5])
  // today's rules: over the $100 instant limit, within one OK ($300)
  for (const s of en["preview.one_ok.over_cap"]!.replace("{limit}", "$100").split(" · ")) await expect(phone(page)).toContainText(s)
  await expect(primary(page)).toHaveText(en["spend.cta.one_ok"]!)
  await expect(page.locator("[data-phone-push]")).toHaveCount(0)
  await forward(page, "phone") // [Ask for one OK]
  for (const s of [...en["spend.one_ok_sent"]!.split(" · "), en["feed.pending.one_ok"]!, fill(en["approve.one_ok.who"]!, { potName: "Lisbon Trip", name: "Maya" })])
    await expect(phone(page)).toContainText(s)
  await expect(phone(page)).not.toContainText("approvals")
  await expect(page.locator("[data-phone-push]")).toHaveCount(0)
  await forward(page) // step 10: Leo's lock screen first ("Maya needs one OK"), then the Approve sheet
  await expect(page.locator("[data-tour-you]")).toHaveAttribute("data-tour-you", "leo")
  const push = page.locator("[data-tour-stage] [data-phone-push]")
  await expect(push).toBeVisible()
  await expect(push).toContainText(fill(en["notif.one_ok.title"]!, { name: "Maya" }))
  await expect(primary(page)).toHaveCount(0)
  await expect(page.locator("[data-phone-push]")).toHaveCount(0)
  await expect(primary(page)).toHaveText(fill(en["approve.cta.ok"]!, { amount: "$300" }))
  for (const s of [fill(en["approve.why.one_ok"]!, { name: "Maya" }), en["approve.one_ok.header"]!]) await expect(phone(page)).toContainText(s)
  await forward(page, "phone") // [OK $300]
  for (const s of [fill(en["approve.ok.done"]!, { amount: "$300", name: "Maya" }), fill(en["approve.timeline.ok"]!, { name: "You" }), "$66.00"])
    await expect(phone(page)).toContainText(s)
  await expect(page.locator("[data-phone-push]")).toHaveCount(0)
  // Back into step 10 shows the sheet straight away: the push is for stepping forward only
  await page.locator("[data-tour-back]").click()
  await at(page, 10)
  await expect(page.locator("[data-phone-push]")).toHaveCount(0)
  await expect(primary(page)).toBeVisible()
  // step 13: Sam's push, then the Approve closing sheet
  await open(page, "/demo#step-12", 12)
  await expect(page.locator("[data-tour-you]")).toHaveAttribute("data-tour-you", "maya")
  await forward(page, "phone") // [Ask the group to close]
  await expect(page.locator("[data-tour-you]")).toHaveAttribute("data-tour-you", "sam")
  await expect(page.locator("[data-tour-stage] [data-phone-push]")).toBeVisible()
  await expect(page.locator("[data-phone-push]")).toHaveCount(0)
  await expect(primary(page)).toBeVisible()
})

test("J-5: part 5, close the Pot and $22 back each, then the end screen and Start a real Pot", async ({ page }) => {
  await open(page, "/demo/6", TOUR_CHAPTER_START[6])
  await expect(phone(page)).toContainText("$22.00")
  for (let n = 12; n < TOUR.length; n++) await forward(page, "phone")
  await at(page, 14)
  await expect(page.locator("[data-tour-you]")).toHaveAttribute("data-tour-you", "sam")
  await expect(phone(page)).toContainText("$22.00")
  await expect(phone(page)).toContainText("$0.00")
  // the recap lives in part 5's "Under the hood" now
  await page.locator("[data-tour-hood-trigger]").click()
  await expect(hoodSheet(page)).toBeVisible()
  await expect(hoodSheet(page)).toContainText(en["demo.recap.title"]!)
  await expect(hoodSheet(page).locator('[data-recap-total="signatures"]')).toHaveText("11")
  await expect(hoodSheet(page).locator('[data-recap-total="transactions"]')).toHaveText("12")
  await page.keyboard.press("Escape")
  await expect(hoodSheet(page)).toHaveCount(0)
  // Finish → the end, focus on its title
  await expect(nextBtn(page)).toHaveText(en["tour.finish"]!)
  await nextBtn(page).click()
  await at(page, TOUR_END)
  await expect(page.locator("[data-tour-title]")).toBeFocused()
  for (const k of ["tour.end.l1", "tour.end.l2", "tour.end.l3", "tour.end.l4", "tour.end.l5", "tour.end.note"]) await expect(stage(page)).toContainText(en[k]!)
  await brandChecks(page, { marigold: "one" })
  await expect(page.locator("[data-tour-home]")).toHaveText(en["tour.end.home"]!)
  await startRealPot(page)
})

/** Each part's judge strings (05 J-1…J-5's hood checks, now one sheet per part). */
const HOOD_SAYS: Record<number, string[]> = {
  1: ["create_pot", "UseGlobalContract"],
  2: ["pot-join:v1:lisbon-trip-7k2f.pots.potprev.testnet", "ft_transfer_call"],
  3: ["request_spend", "VoteApprove", "Proposal #2 in Lisbon Trip", "decides alone (1 of 1)", "84000000"],
  4: ["2 of 2 approvals", "min(3 × 1 ÷ 2 + 1, 3)) = 2", "VoteApprove"],
  5: ["ft_transfer", en["demo.recap.title"]!],
}

test("the hood: each part's Under the hood opens in Night with its decoded cards and real testnet links, and closes with Escape", async ({ page }) => {
  test.setTimeout(90_000)
  for (const part of TOUR_PARTS) {
    const first = stepsOfPart(part.n)[0]!.n
    await open(page, `/demo#step-${first}`, first)
    const trigger = page.locator(`[data-tour-hood-trigger="${part.n}"]`)
    await expect(trigger).toHaveText(en["tour.hood.label"]!)
    await expect(trigger).toHaveAttribute("aria-haspopup", "dialog")
    await expect(trigger).toHaveAttribute("aria-expanded", "false")
    await trigger.click()
    const sheet = hoodSheet(page)
    await expect(sheet).toBeVisible()
    await expect(trigger).toHaveAttribute("aria-expanded", "true")
    await expect(sheet.locator(`[data-hood-sheet="${part.n}"] [data-hood-part="${part.n}"]`)).toBeAttached()
    // Night-scoped, on a Day (or Night) page
    expect(await sheet.evaluate((e) => [e.closest("[data-theme]")?.getAttribute("data-theme"), getComputedStyle(e).backgroundColor])).toEqual(["night", "rgb(28, 20, 36)"])
    await expect(sheet).toContainText(fill(en["demo.near.title"]!, { part: en[part.nameKey]! }))
    await expect(sheet).toContainText(en["demo.sim.chip"]!)
    await expect(sheet.locator("[data-hood-summary]")).toHaveText(en[part.summaryKey]!)
    for (const s of HOOD_SAYS[part.n]!) await expect(sheet, `part ${part.n}: ${s}`).toContainText(s)
    for (const h of realOf(part.n)) await expect(sheet.locator(`a[href="https://testnet.nearblocks.io/txns/${h}"]`).first()).toBeAttached()
    await expect(sheet.locator("a[data-hood-all]")).toHaveAttribute("href", "/demo/all")
    // the content exists once: it moved out of the (hidden) story list
    await expect(page.locator(`[data-hood-part="${part.n}"]`)).toHaveCount(1)
    await brandChecks(page, { marigold: "none" })
    // the arrows don't move the tour while it is open; Escape closes it, focus returns, the step is unchanged
    await page.keyboard.press("ArrowRight")
    await expect(stage(page)).toHaveAttribute("data-state", String(first))
    await page.keyboard.press("Escape")
    await expect(sheet).toHaveCount(0)
    await expect(trigger).toBeFocused()
    await expect(trigger).toHaveAttribute("aria-expanded", "false")
    await expect(stage(page)).toHaveAttribute("data-state", String(first))
  }
})

test("the hood's glossary: a word opens its meaning in Night; Escape closes the word, then the hood", async ({ page }) => {
  await open(page, "/demo#step-1", 1)
  await page.locator("[data-tour-hood-trigger]").click()
  const sheet = hoodSheet(page)
  await expect(sheet).toBeVisible()
  const term = sheet.locator("button[data-glossary-term='relayer']").first()
  await term.scrollIntoViewIfNeeded()
  await term.click()
  const pop = page.locator("[data-glossary-popup='relayer']")
  await expect(pop).toBeVisible()
  await expect(pop).toContainText(en["demo.g.relayer"]!)
  await expect(pop).toHaveAttribute("data-theme", "night")
  await page.keyboard.press("Escape")
  await expect(pop).toBeHidden()
  await expect(sheet).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(sheet).toHaveCount(0)
})

test("every card in the hood keeps its raw JSON one disclosure away", async ({ page }) => {
  await open(page, "/demo#step-6", 6)
  await page.locator("[data-tour-hood-trigger]").click()
  const sheet = hoodSheet(page)
  await expect(sheet).toBeVisible()
  const raws = sheet.locator("details[data-raw-json]")
  expect(await raws.count()).toBeGreaterThan(4)
  for (const d of await raws.all()) expect(await d.evaluate((e) => (e as HTMLDetailsElement).open)).toBe(false)
  await sheet.evaluate((s) => s.querySelectorAll("details[data-raw-json]").forEach((d) => ((d as HTMLDetailsElement).open = true)))
  await expect(sheet.locator("pre").filter({ hasText: "delegate_action" }).first()).toBeAttached()
  await expect(sheet).toContainText("What the app posts to our relayer")
  // plain first: each group of cards opens with its caption
  const order = await sheet.evaluate((s) => [...s.querySelectorAll("[data-hood-group]")].every((g) => g.firstElementChild?.hasAttribute("data-caption")))
  expect(order).toBe(true)
})

test("deep links: /demo/1…6, #step-n, #end, old #beat-k, ?step=, #near and a glossary word", async ({ page }) => {
  test.setTimeout(90_000)
  // the old chapter pages open the same tour at that chapter's first step (the landing links /demo/4)
  for (const n of [1, 2, 3, 4, 5, 6] as const) await open(page, `/demo/${n}`, TOUR_CHAPTER_START[n])
  // a deep link says "This is a simulation" in its first caption box, once
  await open(page, "/demo/4", 6)
  await expect(page.locator("[data-tour-sim]")).toHaveText(en["tour.sim"]!)
  await forward(page, "phone")
  await expect(page.locator("[data-tour-sim]")).toHaveCount(0)
  // fragments, and the fragment follows the tour
  for (const n of [1, 7, 10, 14]) await open(page, `/demo#step-${n}`, n)
  await expect(page.locator("[data-tour-you]")).toHaveAttribute("data-tour-you", "sam")
  await open(page, "/demo#end", TOUR_END)
  // a fragment changed by hand moves the tour too
  await page.evaluate(() => (window.location.hash = "#step-9"))
  await at(page, 9)
  await open(page, "/demo", TOUR_COVER)
  await forward(page)
  await expect(page).toHaveURL(/\/demo#step-1$/)
  await forward(page)
  await expect(page).toHaveURL(/\/demo#step-2$/)
  // old /demo/N#beat-k links land on the nearest step (README's /demo/4#beat-7 is the $84 approval)
  await open(page, "/demo/4#beat-7", 7)
  await expect(phone(page)).toContainText("$366.00")
  await expect(page.locator("[data-celebration]")).toHaveCount(0)
  await open(page, "/demo/5#beat-8", stepForLegacyBeat(5, 8))
  await expect(page.locator("[data-tour-you]")).toHaveAttribute("data-tour-you", "leo")
  await open(page, "/demo/6#beat-2", stepForLegacyBeat(6, 2))
  await page.goto("/demo?step=3")
  await expect(page).toHaveURL(/\/demo\/3(\?|$)/)
  // #near opens the current part's hood
  await open(page, "/demo/4#near", 6)
  await expect(hoodSheet(page)).toBeVisible()
  await expect(hoodSheet(page).locator('[data-hood-sheet="3"]')).toBeAttached()
  // #p{n}-g-<id> opens that part's hood with the glossary open at the word
  await open(page, "/demo#p3-g-rulebot", TOUR_COVER)
  await expect(hoodSheet(page)).toBeVisible()
  const word = hoodSheet(page).locator("#p3-g-rulebot")
  await expect(word).toBeVisible()
  await expect(word).toContainText(en["demo.g.rulebot.term"]!)
  // a bare #g-<id> opens the current part's word
  await open(page, "/demo/5#g-threshold", 8)
  await expect(hoodSheet(page).locator("#p4-g-threshold")).toBeVisible()
})

test("the burst never replays: not on a deep link, not after Back + Next, not under reduced motion", async ({ page }) => {
  await open(page, "/demo#step-7", 7)
  await expect(phone(page)).toContainText("$366.00")
  await expect(nextBtn(page)).not.toHaveAttribute("aria-disabled", "true")
  await page.locator("[data-tour-back]").click()
  await at(page, 6)
  await forward(page)
  await expect(phone(page)).toContainText("$366.00")
  await expect(page.locator("[data-celebration]")).toHaveCount(0)
  // Back into 7 lands on the settled screen, with no hold
  await forward(page)
  await page.locator("[data-tour-back]").click()
  await at(page, 7)
  await expect(nextBtn(page)).not.toHaveAttribute("aria-disabled", "true")
  await expect(phone(page)).toContainText("$84 sent to you")
  expect(await bursts(page)).toBe(0)

  // reduced motion: the 1.2 s check stays (it is pacing), the burst never plays
  await page.emulateMedia({ reducedMotion: "reduce" })
  await open(page, "/demo/4", 6)
  const t0 = Date.now()
  await forward(page, "phone")
  await expect(nextBtn(page)).toHaveAttribute("aria-disabled", "true")
  await expect(phone(page)).toContainText("Checking Pot rules")
  await expect(nextBtn(page)).not.toHaveAttribute("aria-disabled", "true")
  expect(Date.now() - t0).toBeGreaterThanOrEqual(1200)
  await expect(phone(page)).toContainText("$366.00")
  await page.waitForTimeout(700)
  await expect(page.locator("[data-celebration]")).toHaveCount(0)
  expect(await bursts(page)).toBe(0)
})

test("Back, Skip and the keyboard; focus stays where the visitor is", async ({ page }) => {
  await open(page, "/demo", TOUR_COVER)
  // Tab order: skip link → home → the Testnet badge → [Skip to the end] → [Show me how], with the brand's 2 px ring
  await page.keyboard.press("Tab")
  await page.keyboard.press("Tab")
  await expect(page.getByRole("link", { name: "Pot, home" })).toBeFocused()
  await page.keyboard.press("Tab")
  await expect(page.locator("button[data-network-badge='demo']")).toBeFocused()
  await page.keyboard.press("Tab")
  await expect(page.locator("[data-tour-skip]")).toBeFocused()
  await page.keyboard.press("Tab")
  const start = page.locator("[data-tour-start]")
  await expect(start).toBeFocused()
  expect(await start.evaluate((e) => getComputedStyle(e).outlineWidth)).toBe("2px")
  // [Show me how] → step 1, focus on Next
  await page.keyboard.press("Enter")
  await at(page, 1)
  await expect(nextBtn(page)).toBeFocused()
  await expect(nextBtn(page)).toHaveAttribute("aria-keyshortcuts", "ArrowRight")
  await expect(page.locator("[data-tour-back]")).toHaveAttribute("aria-keyshortcuts", "ArrowLeft")
  // Next keeps focus on Next
  await nextBtn(page).click()
  await at(page, 2)
  await expect(nextBtn(page)).toBeFocused()
  // → / ← step the tour
  await page.keyboard.press("ArrowRight")
  await at(page, 3)
  await page.keyboard.press("ArrowRight")
  await at(page, 4)
  await page.keyboard.press("ArrowLeft")
  await at(page, 3)
  // Back stays on Back; on step 1 it is disabled and ← does nothing
  await page.locator("[data-tour-back]").click()
  await at(page, 2)
  await expect(page.locator("[data-tour-back]")).toBeFocused()
  await page.locator("[data-tour-back]").click()
  await at(page, 1)
  await expect(page.locator("[data-tour-back]")).toBeDisabled()
  await page.keyboard.press("ArrowLeft")
  await expect(stage(page)).toHaveAttribute("data-state", "1")
  // the phone's own button moves focus to Next
  await primary(page).click()
  await at(page, 2)
  await expect(nextBtn(page)).toBeFocused()
  // [Skip to the end] → the end, focus on its title; ← returns to step 14
  await page.locator("[data-tour-skip]").click()
  await at(page, TOUR_END)
  await expect(page.locator("[data-tour-title]")).toBeFocused()
  await expect(page).toHaveURL(/#end$/)
  await page.keyboard.press("ArrowLeft")
  await at(page, TOUR.length)
  await expect(nextBtn(page)).toBeFocused()
  // the cover's Skip works too
  await open(page, "/demo", TOUR_COVER)
  await page.locator("[data-tour-skip]").click()
  await at(page, TOUR_END)
})

test("the live region speaks each step: the part on its first step, then the step and its caption", async ({ page }) => {
  await open(page, "/demo", TOUR_COVER)
  const live = page.locator("[data-tour-live]")
  await expect(live).toHaveAttribute("aria-live", "polite")
  await expect(live).toHaveAttribute("aria-atomic", "true")
  await expect(live).toHaveText("")
  const say = (n: number) => {
    const s = TOUR[n - 1]!
    const part = TOUR_PARTS[s.part - 1]!
    const lead = stepsOfPart(s.part)[0]!.n === n ? `${fill(en["tour.part"]!, { n: part.n, total: TOUR_PARTS.length, name: en[part.nameKey]! })}. ` : ""
    return `${lead}${fill(en["tour.progress"]!, { n, total: TOUR.length })}. ${en[s.captionKey]}`
  }
  for (let n = 1; n <= 3; n++) {
    await forward(page)
    await expect(live).toHaveText(say(n))
  }
  await page.locator("[data-tour-back]").click()
  await expect(live).toHaveText(say(2))
})

test("no horizontal scroll at 320, in every state and with the hood open", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile-day", "one 320 px run")
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 320, height: 568 })
  await open(page, "/demo", TOUR_COVER)
  const wide = () => page.evaluate(() => document.documentElement.scrollWidth)
  for (let n = TOUR_COVER; n <= TOUR_END; n++) {
    expect(await wide(), `state ${n}`).toBeLessThanOrEqual(320)
    if (n === 6) {
      await page.locator("[data-tour-hood-trigger]").click()
      await expect(hoodSheet(page)).toBeVisible()
      expect(await wide(), "hood open").toBeLessThanOrEqual(320)
      await page.keyboard.press("Escape")
      await expect(hoodSheet(page)).toHaveCount(0)
    }
    if (n < TOUR_END) await forward(page)
  }
})

test("the stage fits one viewport at 390 × 664 (a phone browser's tab), in every state", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile-day", "390 × 844 and 1280 × 800 are checked in J-1")
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 390, height: 664 })
  await open(page, "/demo", TOUR_COVER)
  for (let n = TOUR_COVER; n <= TOUR_END; n++) {
    await fits(page, `390 × 664, state ${n}`)
    if (n < TOUR_END) await forward(page)
  }
})

/** axe (0 serious or critical) at the cover, steps 1, 5, 7, 10 and 14, the end, an open hood with every disclosure in
 *  it open, and a glossary word's popover. */
test("axe: the cover, the steps, step 7, the end and the open hood", async ({ page }) => {
  test.setTimeout(120_000)
  await open(page, "/demo", TOUR_COVER)
  await axe(page)
  for (const n of [1, 5, 10, 14]) {
    await open(page, `/demo#step-${n}`, n)
    await axe(page)
    await brandChecks(page, { marigold: "at-most-one" })
  }
  // step 7 reached by the visitor's own press: checking, then approved with the burst
  await open(page, "/demo#step-6", 6)
  await forward(page, "phone")
  await axe(page)
  await expect(phone(page)).toContainText("$366.00")
  await axe(page)
  await open(page, "/demo#end", TOUR_END)
  await axe(page)
  // the open hood, every disclosure in it open
  await open(page, "/demo#step-8", 8)
  await page.locator("[data-tour-hood-trigger]").click()
  const sheet = hoodSheet(page)
  await expect(sheet).toBeVisible()
  await page.waitForTimeout(450) // the sheet's 360 ms enter
  await sheet.evaluate((s) => s.querySelectorAll("details").forEach((d) => ((d as HTMLDetailsElement).open = true)))
  await page.waitForTimeout(250)
  await axe(page)
  // a glossary word's popover, in part 1's hood
  await open(page, "/demo#step-1", 1)
  await page.locator("[data-tour-hood-trigger]").click()
  await expect(sheet).toBeVisible()
  const term = sheet.locator("button[data-glossary-term]").first()
  await term.scrollIntoViewIfNeeded()
  await term.click()
  await expect(page.locator("[data-glossary-popup]")).toBeVisible()
  await page.waitForTimeout(300) // its 120 ms fade
  await axe(page)
})

// ---------------------------------------------------------------------------------------------------------
// The receipt diagram (the lead's review), now read in the hood sheet and on /demo/all

test("the receipt diagram in the hood: labels sit on their arrow, in front of the lane lines, with room to breathe", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "the lane diagram needs the wide hood")
  test.setTimeout(120_000)
  for (const part of TOUR_PARTS) {
    const first = stepsOfPart(part.n)[0]!.n
    await open(page, `/demo#step-${first}`, first)
    await page.locator("[data-tour-hood-trigger]").click()
    const sheet = hoodSheet(page)
    await expect(sheet).toBeVisible()
    await page.waitForTimeout(450)
    const rows = sheet.locator("[data-lane-row]")
    const count = await rows.count()
    expect(count, `part ${part.n} has lane rows`).toBeGreaterThan(0)
    for (let i = 0; i < count; i++) {
      const row = rows.nth(i)
      await row.evaluate((e) => e.scrollIntoView({ block: "center" }))
      const problems = await row.evaluate((r) => {
        const out: string[] = []
        const box = (e: Element) => e.getBoundingClientRect()
        const label = r.querySelector("[data-route-label]")!
        const arrow = r.querySelector("[data-arrow]")!
        const notes = r.querySelector("[data-route-notes]")
        const L = box(label)
        const A = box(arrow)
        const diagram = r.closest("[data-route-diagram]")!
        const D = box(diagram)
        if (A.width === 0) return ["the lanes are hidden (the hood is too narrow)"]
        // above the arrow, over it horizontally, inside the diagram
        if (L.bottom > A.top + 0.5) out.push("label not above its arrow")
        if (L.right < A.left || L.left > A.right) out.push("label not over its arrow")
        if (L.left < D.left - 0.5 || L.right > D.right + 0.5) out.push("label overflows the diagram")
        if (notes && box(notes).top < A.bottom - 0.5) out.push("gas/result not under the arrow")
        // a lane line never runs through the label or the notes: where a lifeline crosses them, they are on top
        const lines = [...diagram.querySelectorAll("[data-lifeline]")].map(box)
        for (const el of [label, ...(notes ? notes.querySelectorAll("[data-route-chip]") : [])]) {
          const B = box(el)
          for (const ln of lines) {
            const x = ln.left + ln.width / 2
            // (a line that only grazes a chip's rounded corner is not through it)
            if (x <= B.left + 10 || x >= B.right - 10) continue
            for (const y of [B.top + 2, B.top + B.height / 2, B.bottom - 2]) {
              const hit = document.elementFromPoint(x, y)
              if (!hit || !(el === hit || el.contains(hit))) out.push(`a lane line crosses "${(el.textContent ?? "").slice(0, 30)}"`)
            }
          }
        }
        // generous rows: at least 3.5 rem for a real receipt
        if (!r.hasAttribute("data-context") && box(r).height < 56) out.push("row too tight")
        return out
      })
      expect(problems, `part ${part.n} row ${await row.getAttribute("data-lane-row")}`).toEqual([])
    }
    // no two labels in a diagram overlap
    const overlaps = await sheet.evaluate((h) => {
      let bad = 0
      for (const d of h.querySelectorAll("[data-route-diagram]")) {
        const ls = [...d.querySelectorAll("[data-route-label]")].map((e) => e.getBoundingClientRect())
        for (let i = 1; i < ls.length; i++) if (ls[i]!.top < ls[i - 1]!.bottom - 0.5) bad++
      }
      return bad
    })
    expect(overlaps, `part ${part.n}`).toBe(0)
    await page.keyboard.press("Escape")
    await expect(sheet).toHaveCount(0)
  }
})

test("/demo/all: the lane heads stay on screen under the page header while a long chain scrolls", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "the lane diagram needs a wide page")
  await page.goto("/demo/all")
  const diagram = page.locator("[data-all-chapter='5'] [data-route-diagram]").first()
  await diagram.evaluate((e) => window.scrollTo(0, e.getBoundingClientRect().top + window.scrollY + 400))
  const head = await diagram.locator("[data-route-lanes]").boundingBox()
  expect(Math.round(head!.y)).toBe(64)
  // plain first: on the technical read too, each step opens with its caption, then its cards
  const order = await page.evaluate(() =>
    [...document.querySelectorAll("[data-beat-slot] > [data-slot-body]")].every((b) => b.firstElementChild?.hasAttribute("data-step-caption")),
  )
  expect(order).toBe(true)
})
