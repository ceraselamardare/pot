// /group-trip: "collect money for a group trip" (page-plan.md; copy uc.trip.*). The template's first page and its
// reference: hero (the Ski Weekend Pot on a phone) → the problem and an honest comparison of the four usual ways →
// five steps beside the group chat → the Ski Weekend worked example to the cent (lib/marketing/group-trip.ts, the
// app's own rule and close-out math) → rules that fit → FAQ (also the FAQPage JSON-LD) → related → final CTA.
// Static (Cache Components: no request APIs). The hero's [Start a Pot] is the page's one marigold button.
import { Mountain, Sprout, Target } from "lucide-react"
import type { Metadata } from "next"
import { Section, SectionHead } from "@/components/landing/home/Section"
import { Sticker } from "@/components/landing/home/Sticker"
import { CompareTable } from "@/components/marketing/CompareTable"
import { ExampleTable, type ExampleRow } from "@/components/marketing/ExampleTable"
import { Faq, faqItem } from "@/components/marketing/Faq"
import { nameOf, SKI_PEOPLE } from "@/components/marketing/group-trip/cast"
import { SkiChat } from "@/components/marketing/group-trip/SkiChat"
import { SkiWeekendVisual } from "@/components/marketing/group-trip/SkiWeekendVisual"
import { RelatedLinks } from "@/components/marketing/RelatedLinks"
import { RulesFit } from "@/components/marketing/RulesFit"
import { Steps } from "@/components/marketing/Steps"
import { UseCaseFinal } from "@/components/marketing/UseCaseFinal"
import { UseCaseHero } from "@/components/marketing/UseCaseHero"
import { MoneyText } from "@/components/money/MoneyText"
import { Avatar } from "@/components/pot/Avatar"
import { JsonLd } from "@/components/seo/JsonLd"
import { t } from "@/i18n/t"
import { dollars, formatUsd, type Micro } from "@/lib/client/money"
import { SKI_EACH, SKI_EXTRAS, SKI_RULES, SKI_WEEKEND, type SkiSpend } from "@/lib/marketing/group-trip"
import { pageMeta } from "@/lib/marketing/meta"
import { marketingPage } from "@/lib/marketing/pages"
import { breadcrumbs, faqPage, graph, homeCrumb, webPage } from "@/lib/marketing/schema"

const PATH = "/group-trip"
export const metadata: Metadata = pageMeta(PATH)

const whole = (m: Micro) => formatUsd(m, "whole")
const INSTANT = whole(SKI_RULES.instantCap) // $100
const PER_PERSON = whole(SKI_RULES.memberBudget) // $200
const ONE_OK = whole(SKI_EXTRAS.oneOkCap) // $300
const EACH = whole(SKI_EACH) // $300
const W = SKI_WEEKEND
const spend = (id: SkiSpend["id"]) => W.spends.find((s) => s.id === id)!
const CABIN = spend("cabin")
const GROCERIES = spend("groceries")
const LIFT = spend("lift")
/** "a longer trip" suggestion: within the app's limits (instant ≤ $1,000, per person ≥ instant) */
const LONG = { instant: whole(dollars(150)), perPerson: whole(dollars(500)) }

const FAQ = [
  faqItem("best", t("uc.trip.faq.best.q"), t("uc.trip.faq.best.a")),
  { ...faqItem("much", t("uc.trip.faq.much.q"), t("uc.trip.faq.much.a")), link: { href: "/tools/group-trip-cost-calculator", label: t("uc.calc.link.much") } },
  faqItem("dropout", t("uc.trip.faq.dropout.q"), t("uc.trip.faq.dropout.a")),
  faqItem("leftover", t("uc.trip.faq.leftover.q"), t("uc.trip.faq.leftover.a")),
  faqItem("kitty", t("uc.trip.faq.kitty.q"), t("uc.trip.faq.kitty.a")),
  faqItem("free", t("uc.trip.faq.free.q"), t("uc.trip.faq.free.a")),
  faqItem("app", t("uc.trip.faq.app.q"), t("uc.trip.faq.app.a"), t("uc.common.signin_today")),
  faqItem("real", t("uc.trip.faq.real.q"), t("uc.trip.faq.real.a")),
]

const page = marketingPage(PATH)
const STRUCTURED_DATA = graph(
  webPage({ path: PATH, name: t(page.titleKey), description: t(page.descriptionKey), dateModified: page.lastModified, datePublished: "2026-11-06" }),
  breadcrumbs([homeCrumb(), { name: t("uc.trip.crumb"), path: PATH }]),
  faqPage({ path: PATH, items: FAQ.map(({ question, answer }) => ({ question, answer })) }),
)

export default function GroupTripPage() {
  return (
    <>
      <JsonLd data={STRUCTURED_DATA} />
      <UseCaseHero
        eyebrow={t("uc.trip.hero.eyebrow")}
        title={t("uc.trip.hero.title")}
        subhead={t("uc.trip.hero.subhead")}
        visual={<SkiWeekendVisual />}
      />
      <Problem />
      <HowTo />
      <WorkedExample />
      <Rules />
      <Faq title={t("uc.trip.faq.title")} items={FAQ} />
      <RelatedLinks current={PATH} />
      <UseCaseFinal title={t("uc.trip.final.title")} body={t("uc.trip.final.body")} sticker="sunglasses" />
    </>
  )
}

function Problem() {
  const way = (id: "front" | "split" | "account" | "pot") =>
    ({
      front: { name: t("uc.trip.compare.front.name"), values: [t("uc.trip.compare.front.first"), t("uc.trip.compare.front.holds"), t("uc.trip.compare.front.big"), t("uc.trip.compare.front.end")] },
      split: { name: t("uc.trip.compare.split.name"), values: [t("uc.trip.compare.split.first"), t("uc.trip.compare.split.holds"), t("uc.trip.compare.split.big"), t("uc.trip.compare.split.end")] },
      account: { name: t("uc.trip.compare.account.name"), values: [t("uc.trip.compare.account.first"), t("uc.trip.compare.account.holds"), t("uc.trip.compare.account.big"), t("uc.trip.compare.account.end")] },
      pot: { name: t("uc.trip.compare.pot.name"), values: [t("uc.trip.compare.pot.first"), t("uc.trip.compare.pot.holds"), t("uc.trip.compare.pot.big"), t("uc.trip.compare.pot.end")] },
    })[id]
  return (
    <Section id="problem" labelledBy="problem-title">
      <SectionHead id="problem-title" eyebrow={t("uc.trip.problem.eyebrow")} title={t("uc.trip.problem.title")} intro={t("uc.trip.problem.body")} />
      <CompareTable
        caption={t("uc.trip.compare.caption")}
        wayLabel={t("uc.trip.compare.col.way")}
        criteria={[t("uc.trip.compare.col.first"), t("uc.trip.compare.col.holds"), t("uc.trip.compare.col.big"), t("uc.trip.compare.col.end")]}
        ways={[
          { id: "front", ...way("front") },
          { id: "split", ...way("split") },
          { id: "account", ...way("account") },
          { id: "pot", ...way("pot"), ours: true },
        ]}
      />
      <p className="mt-4 max-w-flow text-body-sm text-ink-muted lg:max-w-[40rem]">{t("uc.trip.compare.note")}</p>
    </Section>
  )
}

function HowTo() {
  return (
    <Section id="how" labelledBy="how-title">
      <SectionHead id="how-title" eyebrow={t("uc.trip.how.eyebrow")} title={t("uc.trip.how.title")} intro={t("uc.trip.how.intro")} />
      <Steps
        steps={[
          { title: t("uc.trip.how.s1.title"), body: t("uc.trip.how.s1.body", { each: EACH }) },
          { title: t("uc.trip.how.s2.title"), body: t("uc.trip.how.s2.body") },
          { title: t("uc.trip.how.s3.title"), body: t("uc.trip.how.s3.body", { each: EACH }) },
          { title: t("uc.trip.how.s4.title"), body: t("uc.trip.how.s4.body", { oneOk: ONE_OK, n: W.people, k: CABIN.k }) },
          { title: t("uc.trip.how.s5.title"), body: t("uc.trip.how.s5.body", { instant: INSTANT }) },
        ]}
        aside={<SkiChat />}
      />
    </Section>
  )
}

function WorkedExample() {
  const tier = (s: SkiSpend) =>
    s.tier === "instant"
      ? t("uc.trip.example.tier.instant", { instant: INSTANT })
      : s.tier === "one_ok"
        ? t("uc.trip.example.tier.one_ok", { instant: INSTANT, oneOk: ONE_OK })
        : t("uc.trip.example.tier.group", { k: s.k, n: s.n, name: nameOf(s.by) })
  const head = {
    cabin: t("uc.trip.example.row.cabin", { name: nameOf(CABIN.by) }),
    groceries: t("uc.trip.example.row.groceries", { name: nameOf(GROCERIES.by) }),
    lift: t("uc.trip.example.row.lift", { name: nameOf(LIFT.by) }),
  }
  const spends: ExampleRow[] = [
    {
      id: "in",
      head: t("uc.trip.example.row.in", { each: EACH }),
      sub: t("uc.trip.example.row.in.sub", { n: W.people }),
      cells: [<MoneyText key="a" micro={W.total} sign="in" variant="inline" />, <MoneyText key="l" micro={W.total} variant="inline" />],
    },
    ...W.spends.map((s) => ({
      id: s.id,
      head: head[s.id],
      sub: tier(s),
      cells: [<MoneyText key="a" micro={s.amount} sign="out" variant="inline" />, <MoneyText key="l" micro={s.leftAfter} variant="inline" />],
    })),
  ]
  const last = SKI_PEOPLE[W.lastContributor]
  return (
    <Section id="example" labelledBy="example-title" band="sunken" className="dark:bg-ground">
      <SectionHead id="example-title" eyebrow={t("uc.trip.example.eyebrow")} title={t("uc.trip.example.title")} intro={t("uc.trip.example.intro", { each: EACH })} />
      <div className="relative grid gap-6 lg:grid-cols-12 lg:items-start">
        {/* lg: in the empty space right of the intro, over nothing (never on a caption or a number) */}
        <Sticker
          name="receipt"
          width={96}
          sizes="128px"
          rotate={8}
          className="absolute -top-44 right-10 hidden w-24 lg:block"
        />
        <ExampleTable
          className="lg:col-span-7 dark:ring-1 dark:ring-line"
          caption={t("uc.trip.example.spends.caption")}
          columns={[
            { id: "what", label: t("uc.trip.example.col.what") },
            { id: "amount", label: t("uc.trip.example.col.amount"), numeric: true },
            { id: "left", label: t("uc.trip.example.col.left"), numeric: true },
          ]}
          rows={spends}
          note={
            <span className="tabular-nums">
              {t("uc.trip.example.check", {
                total: whole(W.total),
                cabin: whole(CABIN.amount),
                groceries: whole(GROCERIES.amount),
                lift: whole(LIFT.amount),
                left: whole(W.left),
              })}
            </span>
          }
        />
        <ExampleTable
          className="lg:col-span-5 dark:ring-1 dark:ring-line"
          caption={t("uc.trip.example.back.caption")}
          columns={[
            { id: "person", label: t("close.table.person") },
            { id: "in", label: t("close.table.put_in"), numeric: true },
            { id: "back", label: t("close.table.gets_back"), numeric: true },
          ]}
          rows={W.shares.map((s) => ({
            id: s.id,
            head: (
              <span className="flex items-center gap-2">
                <Avatar person={SKI_PEOPLE[s.id]} size="xs" />
                {nameOf(s.id)}
              </span>
            ),
            cells: [<MoneyText key="i" micro={s.putIn} variant="inline" />, <MoneyText key="b" micro={s.getsBack} variant="inline" />],
          }))}
          foot={{
            head: t("close.table.total"),
            cells: [<MoneyText key="i" micro={W.total} variant="inline" />, <MoneyText key="b" micro={W.left} variant="inline" />],
          }}
          note={t("uc.trip.example.back.dust", { each: formatUsd(W.eachBack), remainder: formatUsd(W.remainder), name: last.name })}
        />
      </div>
    </Section>
  )
}

function Rules() {
  return (
    <Section id="rules" labelledBy="rules-title">
      <SectionHead id="rules-title" eyebrow={t("uc.trip.rules.eyebrow")} title={t("uc.trip.rules.title")} intro={t("uc.trip.rules.intro")} />
      <RulesFit
        items={[
          {
            id: "weekend",
            Icon: Mountain,
            title: t("uc.trip.rules.weekend.title"),
            rule: t("uc.trip.rules.weekend.rule", { instant: INSTANT, perPerson: PER_PERSON }),
            body: t("uc.trip.rules.weekend.body", { oneOk: ONE_OK }),
          },
          {
            id: "long",
            Icon: Sprout,
            title: t("uc.trip.rules.long.title"),
            rule: t("uc.trip.rules.long.rule", { instant: LONG.instant, perPerson: LONG.perPerson }),
            body: t("uc.trip.rules.long.body"),
          },
          {
            id: "goal",
            Icon: Target,
            title: t("uc.trip.rules.goal.title"),
            rule: t("uc.trip.rules.goal.rule", { goal: whole(W.total) }),
            body: t("uc.trip.rules.goal.body"),
          },
        ]}
      />
    </Section>
  )
}
