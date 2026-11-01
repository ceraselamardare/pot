// @vitest-environment jsdom
// The /demo NEAR layer (plan/design-direction/05 §8.4, 06 §4-§5): the phone stays jargon-free on every dataset beat,
// every copy key the dataset names exists, the server HTML of /demo/4 carries the judge strings, /demo/all reads in
// order, and the proposal / receipt cards. The tour itself (steps, player, main-path copy) is demo-tour.test.tsx.
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { cleanup, render } from "@testing-library/react"
import { renderToString } from "react-dom/server"
import { afterEach, describe, expect, it } from "vitest"
import { CLI_COMMANDS } from "@/components/demo/cards/Misc"
import { ProposalCard } from "@/components/demo/cards/Proposal"
import { ReceiptRoute } from "@/components/demo/cards/Route"
import { SignedCard } from "@/components/demo/cards/Signed"
import { DemoAll, peopleVMs, phoneBeats, phoneStory } from "@/components/demo/Chapter"
import { beatCards, CHAPTERS, getChapter, SCRIPT, tappedAt } from "@/components/demo/data"
import { plain } from "@/components/demo/Rich"
import { Scene } from "@/components/demo/Scenes"
import { TourPage } from "@/components/demo/TourPage"
import en from "@/i18n/en.json"
import { findBanned } from "@/i18n/banned.mjs"

// jsdom has no matchMedia: no reduced motion, a desktop-wide window
window.matchMedia ??= ((query: string) =>
  ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }) as MediaQueryList) as typeof window.matchMedia

afterEach(() => {
  cleanup()
})

const keys = en as Record<string, string>
const has = (k: string) => k in keys || `${k}#other` in keys

describe("the phone pane", () => {
  it("uses no jargon on any beat of any chapter (the hood is exempt)", () => {
    const people = peopleVMs()
    for (const n of CHAPTERS) {
      const c = getChapter(n)
      const story = phoneStory(c)
      phoneBeats(c).forEach((b, i) => {
        for (const scene of [b.scene, ...(b.before ? [b.before] : [])]) {
          const { container, unmount } = render(
            <Scene scene={scene} story={story} you={b.you} people={people} tapped={b.tapped} active={b.tap} onPrimary={() => {}} burst={0} />,
          )
          const text = container.textContent ?? ""
          const labels = [...container.querySelectorAll("[aria-label]")].map((e) => e.getAttribute("aria-label")).join(" ")
          expect(findBanned(text), `chapter ${n} beat ${i + 1}: ${text.slice(0, 80)}`).toBeNull()
          expect(findBanned(labels), `chapter ${n} beat ${i + 1} labels`).toBeNull()
          unmount()
        }
      })
    }
  })

  it("shows exactly one marigold primary on a tap beat, and none on the others", () => {
    const people = peopleVMs()
    for (const n of CHAPTERS) {
      const c = getChapter(n)
      const story = phoneStory(c)
      phoneBeats(c).forEach((b, i) => {
        const { container, unmount } = render(
          <Scene scene={b.scene} story={story} you={b.you} people={people} tapped={b.tapped} active={b.tap} onPrimary={() => {}} burst={0} />,
        )
        expect(container.querySelectorAll("[data-phone-primary]").length, `chapter ${n} beat ${i + 1}`).toBe(b.tap ? 1 : 0)
        unmount()
      })
    }
  })

  it("shows the busy state after a tap until the screen changes", () => {
    const c1 = getChapter(1)
    expect([1, 2, 3, 4].map((i) => tappedAt(c1, i))).toEqual([false, true, true, true])
    expect(tappedAt(getChapter(4), 1)).toBe(false) // checking is its own phase
  })
})

describe("copy", () => {
  it("has every key the dataset names", () => {
    const missing = new Set<string>()
    const need = (k: string) => void (has(k) || missing.add(k))
    for (const c of SCRIPT.chapters) {
      need(`demo.c${c.n}.title`)
      need(`demo.c${c.n}.aha`)
      need(`demo.c${c.n}.before`)
      for (const b of c.beats) {
        need(b.captionKey)
        for (const card of beatCards(b)) {
          if (card.type === "note") need(card.key)
          if (card.type === "rules") card.rows.forEach((r) => need(`demo.rules.${r.check}`))
        }
      }
      c.real.forEach((r) => need(r.labelKey))
      c.interlude?.real.forEach((r) => need(r.labelKey))
      if (c.interlude) need(c.interlude.key)
      c.glossary.forEach((g) => (need(`demo.g.${g}`), need(`demo.g.${g}.term`)))
    }
    expect([...missing]).toEqual([])
  })

  it("keeps the recap's CLI block verbatim in README J-7", () => {
    const readme = readFileSync(resolve(__dirname, "../../../../README.md"), "utf8")
    for (const line of CLI_COMMANDS) expect(readme).toContain(line)
  })
})

describe("server HTML (no JS, AI judges)", () => {
  it("renders /demo/4 with the whole story and the judge strings, every hood closed", () => {
    const html = renderToString(<TourPage initial={6} chapter={4} />)
    for (const s of ["Approved by Pot rules", "request_spend", "VoteApprove", "84000000", "Simulated", "https://testnet.nearblocks.io/txns/Gmoey4Le16CeqZN45AWpWmmtHgBtDNWnY37HkNnAYtMk"])
      expect(html, s).toContain(s)
    expect(html).not.toContain('role="dialog"')
    expect(html).not.toContain('role="tablist"')
    const hoods = [...html.matchAll(/<details[^>]*data-tour-hood="\d"[^>]*>/g)].map((m) => m[0])
    expect(hoods).toHaveLength(5)
    for (const d of hoods) expect(d).not.toMatch(/\sopen[\s=>]/)
    // the hood keeps the 05 captions of the steps that carry cards
    const text = html.replace(/<[^>]+>/g, "").replaceAll("&#x27;", "'").replaceAll("&quot;", '"').replaceAll("&amp;", "&")
    for (const b of getChapter(4).beats) if (b.pane === "hood") expect(text).toContain(plain(keys[b.captionKey]!))
    expect(html).toContain('id="p3-g-')
  })
})

describe("cards", () => {
  it("draws chapter 5's vote meter at 2 of 3 with words on every seat", () => {
    const c5 = getChapter(5)
    const card = beatCards(c5.beats[7]!).find((x) => x.type === "proposal")!
    if (card.type !== "proposal") throw new Error("no proposal card")
    const { container } = render(<ProposalCard id="p" proposal={card.proposal} meter={card.meter} members={c5.before.dao!.members} />)
    expect(container.textContent).toContain("Proposal #3 in Lisbon Trip")
    expect(container.textContent).toContain("2 of 2 approvals")
    expect(container.textContent).toContain("needs 2")
    expect(container.querySelector("[data-status]")?.textContent).toBe("Approved")
    const seats = [...container.querySelectorAll("[data-seat]")]
    expect(seats).toHaveLength(3)
    for (const s of seats) expect(s.textContent).toMatch(/approved|not yet/)
  })

  it("draws a receipt slice in both layouts, with gas refunds behind a closed disclosure", () => {
    const c4 = getChapter(4)
    const tx = c4.txs[0]!
    const { container } = render(<ReceiptRoute card id="r" tx={tx} rows={[10, 11, 12, 13, 14]} showRefunds />)
    expect(container.textContent).toContain("Receipts 10–14 of 14")
    expect(container.querySelectorAll("[data-receipt]")).toHaveLength(5)
    expect(container.querySelector("[data-route-lanes]")).not.toBeNull()
    const refunds = container.querySelector("details[data-refunds]") as HTMLDetailsElement
    expect(refunds.open).toBe(false)
    expect(refunds.textContent).toMatch(/Show \d+ gas refunds/)
  })

  it("draws each receipt as one arrow with its label on it, callbacks as return arrows, the receipt before dimmed", () => {
    const c4 = getChapter(4)
    const tx = c4.txs[0]!
    const { container } = render(<ReceiptRoute card id="r" tx={tx} rows={[7, 8]} showRefunds={false} />)
    // the diagram is a picture (aria-hidden); the <ol> carries the same receipts for screen readers and narrow cards
    const diagram = container.querySelector("[data-route-diagram]")!
    expect(diagram.getAttribute("aria-hidden")).toBe("true")
    const list = container.querySelector("ol[data-route-list]")!
    expect(list.getAttribute("aria-label")).toBe("Receipts")
    expect(list.className).toContain("@min-[32rem]/card:sr-only")
    expect([...list.querySelectorAll("[data-receipt]")].map((li) => li.getAttribute("data-receipt"))).toEqual(["7", "8"])
    // receipt 6 (the step before) comes first, dimmed, and carries no trace
    const rows = [...diagram.querySelectorAll("[data-lane-row]")]
    expect(rows.map((r) => r.getAttribute("data-lane-row"))).toEqual(["6", "7", "8"])
    expect(rows[0]!.hasAttribute("data-context")).toBe(true)
    expect(rows[0]!.querySelector("[data-trace]")).toBeNull()
    expect(rows[0]!.textContent).toContain("Before this step")
    // one label per row, the batch's actions stacked inside it
    for (const r of rows) expect(r.querySelectorAll("[data-route-label]")).toHaveLength(1)
    expect(rows[1]!.querySelector("[data-actions]")?.getAttribute("data-actions")).toBe("2")
    expect(rows[1]!.textContent).toContain("one receipt, 2 actions")
    expect(rows[1]!.querySelector("[data-arrow]")?.getAttribute("data-arrow")).toBe("call")
    // on_spend_added comes back from the Pot (Lisbon Trip) to the Hub: a dashed return arrow tagged "callback"
    expect(rows[2]!.hasAttribute("data-callback")).toBe(true)
    expect(rows[2]!.querySelector("[data-arrow]")?.getAttribute("data-arrow")).toBe("callback")
    expect(rows[2]!.querySelector("[data-callback-tag]")?.textContent).toBe("callback")
    const cb = list.querySelector("[data-receipt='8']")!
    expect(cb.textContent).toContain("Callback from Lisbon Trip to Pot Hub")
    // gas and the result sit under the arrow
    expect(rows[1]!.querySelector("[data-route-notes]")?.textContent).toMatch(/10 Tgas.*returned 2/)
  })

  it("breaks account ids at their dots, never inside a hyphenated part, and keeps the text the same", () => {
    const c2 = getChapter(2)
    const join = c2.txs.find((x) => x.id === "c2.join")!
    const { container } = render(<SignedCard id="s" tx={join} />)
    const dd = [...container.querySelectorAll("dd")].find((d) => d.textContent?.startsWith("lisbon-trip-7k2f"))!
    expect(dd.textContent).toContain("lisbon-trip-7k2f.pots.potprev.testnet")
    const parts = [...dd.querySelectorAll("span.whitespace-nowrap")].map((x) => x.textContent)
    expect(parts).toEqual(["lisbon-trip-7k2f.", "pots.", "potprev.", "testnet"])
    expect(dd.querySelectorAll("wbr")).toHaveLength(3)
    // the "Simulated values" chip sits with the title, the key on its own row under it
    expect(container.querySelector("[data-card-badge]")?.textContent).toBe("Simulated values")
  })
})

describe("reading order", () => {
  it("puts every step's plain caption before its technical cards, in every chapter of /demo/all", () => {
    const { container } = render(<DemoAll />)
    for (const n of CHAPTERS) {
      const slots = [...container.querySelectorAll(`[data-all-chapter="${n}"] [data-beat-slot]`)]
      expect(slots, `chapter ${n}`).toHaveLength(getChapter(n).beats.length)
      for (const slot of slots) {
        const body = slot.querySelector("[data-slot-body]")!
        expect(body.firstElementChild?.hasAttribute("data-step-caption"), `chapter ${n} step ${slot.getAttribute("data-beat-slot")}`).toBe(true)
        expect(body.querySelectorAll("[data-step-caption]")).toHaveLength(1)
      }
    }
  })
})
