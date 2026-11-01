// The /demo tour without JavaScript (06 §7.4, S10; README J-6): every tour page's server HTML is the stage in its
// cover state, then the whole story as a visible ordered list (per part: a phone, <li id="step-n"> captions, and a
// closed <details> "Under the hood"), then the end with [Start a real Pot]. Each hood's decoded cards, raw JSON,
// simulated hashes, real testnet links and glossary are in the HTML too. No dialog, no tabs. /demo/all is the full
// technical read. Night comes from the tokens' prefers-color-scheme fallback.
import { readFileSync } from "node:fs"
import { expect, test } from "@playwright/test"
import { stepsOfPart, TOUR, TOUR_PARTS } from "../../components/demo/tour"
import { brandChecks } from "../fixtures/pot"

const read = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"))
const en = read("../../i18n/en.json") as Record<string, string>
const script = read("../../app/demo/_data/demo-script.json") as {
  chapters: { n: number; beats: { captionKey: string }[]; real: { hash: string }[] }[]
}
const chapterOf = (n: number) => script.chapters.find((c) => c.n === n)!
/** the copy's inline markup ([[term|words]], [highlight], **bold**) as plain text */
const plain = (s: string) => s.replace(/\[\[[a-z_0-9]+\|([^\]]+)\]\]|\*\*([^*]+)\*\*|\[([^\]]+)\]/g, (_m, a, b, c) => a ?? b ?? c)

test.use({ javaScriptEnabled: false })

const PAGES = ["/demo", "/demo/1", "/demo/2", "/demo/3", "/demo/4", "/demo/5", "/demo/6"]

test("J-6: every tour page's server HTML is the whole story, in order, with five closed hoods", async ({ page }, info) => {
  test.setTimeout(90_000)
  for (const url of PAGES) {
    const res = await page.goto(url)
    expect(res?.status(), url).toBe(200)
    const html = await res!.text()
    // the stage is the cover: its [Show me how] and [Skip to the end] are links into the story list
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(en["tour.cover.title"]!)
    await expect(page.locator("a[data-tour-start]")).toHaveAttribute("href", "#story")
    await expect(page.locator("a[data-tour-skip]")).toHaveAttribute("href", "#end")
    await expect(page.locator("[data-tour-stage]")).toHaveAttribute("data-mode", "cover")
    // the story: 14 steps in order, each with its caption
    const story = page.locator("section#story[data-tour-story]")
    await expect(story).toBeVisible()
    await expect(story.locator("h2")).toHaveText(en["tour.list.title"]!)
    expect(await story.locator("li[id^='step-']").evaluateAll((ls) => ls.map((l) => l.id))).toEqual(TOUR.map((s) => `step-${s.n}`))
    for (const s of TOUR) await expect(story.locator(`li#step-${s.n}`), `${url} step ${s.n}`).toContainText(en[s.captionKey]!)
    // each part: its heading, its steps, then its closed "Under the hood"
    const hoods = story.locator("details[data-tour-hood]")
    expect(await hoods.evaluateAll((ds) => ds.map((d) => [d.getAttribute("data-tour-hood"), (d as HTMLDetailsElement).open]))).toEqual(
      TOUR_PARTS.map((p) => [String(p.n), false]),
    )
    for (const part of TOUR_PARTS) {
      const sec = story.locator(`[data-tour-list-part="${part.n}"]`)
      await expect(sec.locator("h3").first()).toHaveText(fill(en["tour.list.part"]!, { n: part.n, name: en[part.nameKey]! }))
      const order = await sec.evaluate((s, n) => {
        const items = [...s.querySelectorAll("li[id^='step-']")]
        const hood = s.querySelector(`details[data-tour-hood="${n}"]`)!
        return items.length > 0 && items.every((li) => li.compareDocumentPosition(hood) & Node.DOCUMENT_POSITION_FOLLOWING)
      }, part.n)
      expect(order, `${url} part ${part.n}: steps, then the hood`).toBe(true)
      expect(await sec.locator("li[id^='step-']").count()).toBe(stepsOfPart(part.n).length)
      const hood = sec.locator(`details[data-tour-hood="${part.n}"]`)
      await expect(hood.locator("summary")).toHaveText(en["tour.hood.label"]!)
      // the hood's content is its own Suspense boundary (the stage hydrates first), so React may stream it after the
      // list; it is in the HTML either way (curl, AI judges), and with JS it opens in the sheet
      const content = page.locator(`[data-hood-part="${part.n}"]`)
      await expect(content).toHaveCount(1)
      await expect(content.locator("[data-hood-summary]")).toHaveText(en[part.summaryKey]!)
      const inner = await content.evaluate((e) => e.outerHTML)
      expect(inner, `${url} part ${part.n}: a simulated hash`).toMatch(/sim-[1-9A-HJ-NP-Za-km-z]{32}/)
      expect(inner).toMatch(/<details[^>]*data-raw-json/)
      expect(inner).toContain(`id="p${part.n}-g-`)
      for (const c of part.chapters) for (const r of chapterOf(c).real) expect(inner, `${url} part ${part.n}`).toContain(`href="https://testnet.nearblocks.io/txns/${r.hash}"`)
    }
    const text = (await page.locator("body").textContent()) ?? ""
    expect(text).toContain('"delegate_action"')
    // the end: the five lines and [Start a real Pot]
    const end = story.locator("#end[data-tour-list-end]")
    for (const k of ["tour.end.title", "tour.end.l1", "tour.end.l2", "tour.end.l3", "tour.end.l4", "tour.end.l5", "tour.end.note"]) await expect(end).toContainText(en[k]!)
    await expect(end.locator("[data-tour-list-cta]")).toHaveAttribute("href", "/pots?sheet=create")
    expect(html).toContain('href="/pots?sheet=create"')
    // no dialog, no tabs, none of the old explainer's chrome
    expect(html).not.toContain('role="dialog"')
    expect(html).not.toContain('role="tablist"')
    expect(html).not.toMatch(/data-beat-step|data-rail|data-beat-next/)
    // the story's CTA is secondary: the cover's [Show me how] is the page's one marigold
    await brandChecks(page, { marigold: "one" })
    if (url !== "/demo") await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/demo$/)
  }

  // the spec's judge strings for the $84 spend (05 §1, still true of /demo/4)
  const html = await (await page.goto("/demo/4"))!.text()
  for (const s of ["Approved by Pot rules", "request_spend", "VoteApprove", "84000000", "Simulated", "https://testnet.nearblocks.io/txns/"]) expect(html, s).toContain(s)

  const night = info.project.use.colorScheme === "dark"
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(night ? "rgb(28, 20, 36)" : "rgb(250, 249, 246)")
})

test("/demo/all is the full technical read without JavaScript", async ({ page }) => {
  const res = await page.goto("/demo/all")
  expect(res?.status()).toBe(200)
  const html = await res!.text()
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(en["demo.all.title"]!)
  const text = (await page.locator("body").textContent()) ?? ""
  for (const part of TOUR_PARTS) {
    expect(text).toContain(fill(en["tour.list.part"]!, { n: part.n, name: en[part.nameKey]! }))
    expect(text).toContain(en[part.summaryKey]!)
  }
  for (const c of script.chapters) {
    expect(text).toContain(en[`demo.c${c.n}.title`]!)
    // every step of the old explainer, caption first, with its cards
    for (const b of c.beats) expect(text, `chapter ${c.n} ${b.captionKey}`).toContain(plain(en[b.captionKey]!))
    for (const r of c.real) expect(html).toContain(`href="https://testnet.nearblocks.io/txns/${r.hash}"`)
  }
  expect(text).toContain("What our relayer sent")
  expect(text).toContain("What happened on NEAR, receipt by receipt")
  expect(html).toMatch(/<details[^>]*data-raw-json/)
  expect(text).toContain('"delegate_action"')
  expect(await page.locator("ol[data-route-list][aria-label='Receipts'] > li[data-receipt]").count()).toBeGreaterThan(0)
  const order = await page.evaluate(() =>
    [...document.querySelectorAll("[data-beat-slot] > [data-slot-body]")].every((b) => b.firstElementChild?.hasAttribute("data-step-caption")),
  )
  expect(order, "caption first").toBe(true)
  // the recap: 11 signatures by people, 12 transactions
  expect(text).toContain(en["demo.recap.title"]!)
  await expect(page.locator('[data-recap-total="signatures"]')).toHaveText("11")
  await expect(page.locator('[data-recap-total="transactions"]')).toHaveText("12")
  expect(html).toContain('id="all-g-')
})

function fill(s: string, v: Record<string, string | number>) {
  return s.replace(/\{(\w+)\}/g, (_m, k) => String(v[k]))
}
