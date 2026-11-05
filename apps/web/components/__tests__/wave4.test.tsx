// @vitest-environment jsdom
// hub 1.1.0 components: the trust badge (icon + word), "your instant limit" with the next level, the goal banner's
// states (collecting with a countdown, the spending pause, reached, refunding, refunded, a soft goal missed) and the
// spend preview's three tiers (instant with a raised limit, one OK, the group) and the goal hold.
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { RulePreview } from "@/components/sheets/RulePreview"
import { GoalBanner, shownGoalState, timeLeft } from "@/components/wave4/GoalBanner"
import { MyTrustCard, TrustBadge } from "@/components/wave4/Trust"
import { cents } from "@/lib/client/money"
import type { GoalVM, TrustVM } from "@/lib/client/mock/types"
import { DEFAULT_RULES, previewSpend } from "@/lib/client/rules"

afterEach(cleanup)

const NOW = 1_800_000_000_000
const DAY = 86_400_000
const trust = (o: Partial<TrustVM> = {}): TrustVM => ({
  enabled: true,
  level: 1,
  maxLevel: 2,
  nextLevelIn: 2,
  step: 3,
  minQualifying: cents(1_000),
  settled: 4,
  declined: 0,
  baseCap: cents(10_000),
  effectiveCap: cents(20_000),
  instantUpTo: cents(20_000),
  nextCap: cents(30_000),
  ...o,
})
const goal = (o: Partial<GoalVM> = {}): GoalVM => ({
  amount: cents(120_000),
  deadline: NOW + 3 * DAY + 5_000,
  allOrNothing: true,
  totalIn: cents(30_000),
  state: "collecting",
  reachedAt: null,
  spendsBlocked: true,
  ...o,
})

describe("trust", () => {
  it("the badge is an icon and a word for each level", () => {
    const { container } = render(
      <>
        <TrustBadge trust={{ level: 0 }} />
        <TrustBadge trust={{ level: 1 }} />
        <TrustBadge trust={{ level: 2 }} />
      </>,
    )
    expect([...container.querySelectorAll("[data-trust-level]")].map((e) => [e.textContent, !!e.querySelector("svg")])).toEqual([
      ["New", true],
      ["Trusted", true],
      ["Very trusted", true],
    ])
  })

  it("my instant limit: what I can spend now and the paid spends to the next level", () => {
    render(<MyTrustCard trust={trust()} />)
    expect(screen.getByText("You can spend up to $200 without asking")).toBeTruthy()
    expect(screen.getByText("2 more paid spends to $300")).toBeTruthy()
    expect(screen.getByText("Spends of $10 or more count. A declined request lowers it.")).toBeTruthy()
    cleanup()
    render(<MyTrustCard trust={trust({ level: 2, nextLevelIn: 0, nextCap: null, effectiveCap: cents(30_000), instantUpTo: cents(5_000) })} potName="Ski Chalet" />)
    expect(screen.getByText("That's the most trust a Pot gives.")).toBeTruthy()
    expect(screen.getByText("You have $50 left of what you can spend without asking in total.")).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Ski Chalet" })).toBeTruthy()
    cleanup()
    render(<MyTrustCard trust={trust({ level: 1, nextLevelIn: 1 })} />)
    expect(screen.getByText("1 more paid spend to $300")).toBeTruthy()
  })
})

describe("goal banner", () => {
  it("collecting: '$300 of $1,200 · 3 days left', the spending pause and the all-or-nothing promise", () => {
    const { container } = render(<GoalBanner goal={goal()} potName="Festival Fund" now={NOW} />)
    expect(container.querySelector("[data-goal-text]")!.textContent).toBe("$300 of $1,200 · 3 days left")
    expect(screen.getByText("Spending opens once the goal is reached.")).toBeTruthy()
    expect(screen.getByText(/^All or nothing: if we don't reach \$1,200 by .+, everyone gets their money back automatically\.$/)).toBeTruthy()
  })

  it("time left: days, then hours, then under an hour", () => {
    expect(timeLeft(NOW + 2 * DAY + 1, NOW)).toBe("2 days left")
    expect(timeLeft(NOW + DAY, NOW)).toBe("1 day left")
    expect(timeLeft(NOW + 5 * 3_600_000, NOW)).toBe("5 hours left")
    expect(timeLeft(NOW + 59_000, NOW)).toBe("Less than an hour left")
  })

  it("past the date a 'collecting' read shows what the hub will say", () => {
    expect(shownGoalState(goal({ deadline: NOW - 1 }), NOW)).toBe("refundable")
    expect(shownGoalState(goal({ deadline: NOW - 1, allOrNothing: false }), NOW)).toBe("missed")
    expect(shownGoalState(goal({ state: "reached" }), NOW)).toBe("reached")
  })

  it("reached, refunding, refunded and a soft goal missed: icon + words, announced", () => {
    const cases: [Partial<GoalVM>, string, string][] = [
      [{ state: "reached", spendsBlocked: false }, "reached", "Goal reached"],
      [{ state: "refunding" }, "refunding", "Refunding everyone…"],
      [{ deadline: NOW - 1 }, "refundable", "Refunding everyone…"],
      [{ state: "refunded" }, "refunded", "Everyone got their money back"],
      [{ state: "missed", allOrNothing: false, spendsBlocked: false }, "missed", "The goal date passed"],
    ]
    for (const [o, state, title] of cases) {
      const { container } = render(<GoalBanner goal={goal(o)} potName="Festival Fund" now={NOW} />)
      const el = container.querySelector(`[data-goal-banner="${state}"]`)!
      expect(el.getAttribute("role")).toBe("status")
      expect(el.textContent).toContain(title)
      expect(el.querySelector("svg")).toBeTruthy()
      cleanup()
    }
  })
})

describe("spend preview: three tiers", () => {
  const base = { balance: cents(150_000), rules: DEFAULT_RULES, memberCount: 3, used: 0n, contributed: cents(15_000), receiverIsMember: true }
  const extras = { trust: true, oneOkCap: cents(30_000) }
  const show = (amount: number, o: Record<string, unknown> = {}) => {
    const p = previewSpend({ ...base, amount: cents(amount), extras, trustLevel: 1, ...o })
    const { container } = render(<RulePreview preview={p} pot={{ rules: DEFAULT_RULES, balance: base.balance, goalDetail: goal() }} used={0n} />)
    const el = container.querySelector("[data-rule-preview]")!
    const text = el.textContent
    cleanup()
    return { p, text, tier: el.getAttribute("data-tier") }
  }

  it("instant up to my raised limit, one OK up to the ceiling, then the group", () => {
    expect(show(15_000)).toMatchObject({ tier: "instant", text: "This will be approved instantlyYou can spend up to $200 without asking." })
    expect(show(25_000)).toMatchObject({ tier: "one_ok", text: "This needs one OK from someone else who has added moneyIt's over your $200 instant limit." })
    expect(show(25_000, { memberCount: 1 }).tier).toBe("group")
    expect(show(30_001)).toMatchObject({ tier: "group" })
    expect(show(30_001).text).toContain("This needs 2 of 3 approvals")
    // hub 1.3.0 (HUB-2 / W4-1): someone who hasn't added money (≥ $1) can't spend at once or with one OK
    expect(show(5_000, { contributed: 0n })).toMatchObject({ tier: "group" })
    expect(show(5_000, { contributed: 999_999n }).tier).toBe("group")
    expect(show(5_000, { contributed: 1_000_000n }).tier).toBe("instant")
  })

  it("without extras (a 1.0.0 Pot) no tier and the old sentences", () => {
    const p = previewSpend({ ...base, amount: cents(15_000) })
    expect(p).toMatchObject({ path: "vote", reason: "over_cap" })
    expect(p.tier).toBeUndefined()
  })

  it("an all-or-nothing goal holds every spend", () => {
    const r = show(1_000, { goalBlocks: true })
    expect(r.p).toMatchObject({ path: "blocked", reason: "goal" })
    expect(r.text).toBe("Spending opens once the goal is reached$300 of $1,200 collected so far.")
  })
})
