// /bachelorette-party: "how to collect money for a bachelorette party", and for bachelor parties, hen and stag dos
// (page-plan.md; copy uc.party.*). Hero (the group approving the house, 5 of 8) → the problem (the maid of honour as
// the bank) → five steps beside who's in the Pot (the guest of honour isn't) → the Lake House Weekend worked example
// to the cent (lib/marketing/bachelorette-party.ts, the app's own rule and close-out math) → who pays for what
// (etiquette: general guidance, no statistics) and "hen do or bachelorette?" → rules that fit → FAQ (also the FAQPage
// JSON-LD) → related → final CTA. Static (Cache Components: no request APIs). The hero's [Start a Pot] is the page's
// one marigold button.
import { CalendarClock, CreditCard, Eye, EyeOff, HandHeart, MessageCircleMore, PartyPopper, Scale, Target, Users } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { Metadata } from "next"
import { Section, SectionHead } from "@/components/landing/home/Section"
import { GuestList } from "@/components/marketing/bachelorette-party/GuestList"
import { LakeHouseVisual } from "@/components/marketing/bachelorette-party/LakeHouseVisual"
import { nameOf } from "@/components/marketing/bachelorette-party/cast"
import { ExampleTable, type ExampleRow } from "@/components/marketing/ExampleTable"
import { Faq, faqItem } from "@/components/marketing/Faq"
import { RelatedLinks } from "@/components/marketing/RelatedLinks"
import { RulesFit } from "@/components/marketing/RulesFit"
import { Steps } from "@/components/marketing/Steps"
import { UseCaseFinal } from "@/components/marketing/UseCaseFinal"
import { UseCaseHero } from "@/components/marketing/UseCaseHero"
import { MoneyText } from "@/components/money/MoneyText"
import { JsonLd } from "@/components/seo/JsonLd"
import { t } from "@/i18n/t"
import { formatUsd, type Micro } from "@/lib/client/money"
import { LAKE_HOUSE, PARTY_EACH, type PartySpend, type PartySpendId } from "@/lib/marketing/bachelorette-party"
import { EXAMPLE_EXTRAS, EXAMPLE_RULES } from "@/lib/marketing/example-math"
import { pageMeta } from "@/lib/marketing/meta"
import { marketingPage } from "@/lib/marketing/pages"
import { breadcrumbs, faqPage, graph, homeCrumb, webPage } from "@/lib/marketing/schema"

const PATH = "/bachelorette-party"
export const metadata: Metadata = pageMeta(PATH)

const whole = (m: Micro) => formatUsd(m, "whole")
const INSTANT = whole(EXAMPLE_RULES.instantCap) // $100
const PER_PERSON = whole(EXAMPLE_RULES.memberBudget) // $200
const ONE_OK = whole(EXAMPLE_EXTRAS.oneOkCap) // $300
const EACH = whole(PARTY_EACH) // $250
const W = LAKE_HOUSE
const spend = (id: PartySpendId) => W.spends.find((s) => s.id === id)!
const HOUSE = spend("house")
const DECORATIONS = spend("decorations")
const DINNER = spend("dinner")

const FAQ = [
  faqItem("collect", t("uc.party.faq.collect.q"), t("uc.party.faq.collect.a"), t("uc.common.signin_today")),
  faqItem("honour", t("uc.party.faq.honour.q"), t("uc.party.faq.honour.a")),
  faqItem("much", t("uc.party.faq.much.q"), t("uc.party.faq.much.a")),
  faqItem("short", t("uc.party.faq.short.q"), t("uc.party.faq.short.a")),
  faqItem("before", t("uc.party.faq.before.q"), t("uc.party.faq.before.a")),
  faqItem("kitty", t("uc.party.faq.kitty.q"), t("uc.party.faq.kitty.a", { instant: INSTANT })),
  faqItem("free", t("uc.party.faq.free.q"), t("uc.party.faq.free.a")),
  faqItem("real", t("uc.party.faq.real.q"), t("uc.party.faq.real.a")),
]

const page = marketingPage(PATH)
const STRUCTURED_DATA = graph(
  webPage({ path: PATH, name: t(page.titleKey), description: t(page.descriptionKey), dateModified: page.lastModified, datePublished: "2026-11-06" }),
  breadcrumbs([homeCrumb(), { name: t("uc.party.crumb"), path: PATH }]),
  faqPage({ path: PATH, items: FAQ.map(({ question, answer }) => ({ question, answer })) }),
)

export default function BachelorettePartyPage() {
  return (
    <>
      <JsonLd data={STRUCTURED_DATA} />
      <UseCaseHero
        eyebrow={t("uc.party.hero.eyebrow")}
        title={t("uc.party.hero.title")}
        subhead={t("uc.party.hero.subhead")}
        visual={<LakeHouseVisual />}
      />
      <Problem />
      <HowTo />
      <WorkedExample />
      <Etiquette />
      <Rules />
      <Faq title={t("uc.party.faq.title")} items={FAQ} />
      <RelatedLinks current={PATH} />
      <UseCaseFinal title={t("uc.party.final.title")} body={t("uc.party.final.body")} />
    </>
  )
}

/** A card with an icon, an H3 and a line: the problem's pains and the etiquette's advice. */
function IconCard({ Icon, title, body }: { Icon: LucideIcon; title: string; body: string }) {
  return (
    <li className="flex gap-4 rounded-lg bg-surface p-4 shadow-card md:p-6">
      <span className="grid size-10 shrink-0 place-items-center rounded-pill bg-surface-sunken">
        <Icon aria-hidden className="size-5 text-ink" strokeWidth={2} />
      </span>
      <div className="min-w-0">
        <h3 className="font-display text-heading text-ink">{title}</h3>
        <p className="mt-1 text-body text-ink-muted">{body}</p>
      </div>
    </li>
  )
}

function Problem() {
  return (
    <Section id="problem" labelledBy="problem-title">
      <SectionHead id="problem-title" eyebrow={t("uc.party.problem.eyebrow")} title={t("uc.party.problem.title")} intro={t("uc.party.problem.body")} />
      <ul className="grid gap-3 lg:grid-cols-3 lg:gap-6" data-problem>
        <IconCard Icon={CreditCard} title={t("uc.party.problem.front.title")} body={t("uc.party.problem.front.body")} />
        <IconCard Icon={MessageCircleMore} title={t("uc.party.problem.chase.title")} body={t("uc.party.problem.chase.body")} />
        <IconCard Icon={EyeOff} title={t("uc.party.problem.secret.title")} body={t("uc.party.problem.secret.body")} />
      </ul>
    </Section>
  )
}

function HowTo() {
  return (
    <Section id="how" labelledBy="how-title">
      <SectionHead id="how-title" eyebrow={t("uc.party.how.eyebrow")} title={t("uc.party.how.title")} intro={t("uc.party.how.intro")} />
      <Steps
        steps={[
          { title: t("uc.party.how.s1.title"), body: t("uc.party.how.s1.body", { each: EACH }) },
          { title: t("uc.party.how.s2.title"), body: t("uc.party.how.s2.body") },
          { title: t("uc.party.how.s3.title"), body: t("uc.party.how.s3.body", { each: EACH }) },
          { title: t("uc.party.how.s4.title"), body: t("uc.party.how.s4.body", { oneOk: ONE_OK, n: W.people, k: HOUSE.k }) },
          { title: t("uc.party.how.s5.title"), body: t("uc.party.how.s5.body", { instant: INSTANT, oneOk: ONE_OK }) },
        ]}
        aside={<GuestList />}
      />
    </Section>
  )
}

function WorkedExample() {
  const tier = (s: PartySpend) =>
    s.tier === "instant"
      ? t("uc.party.example.tier.instant", { instant: INSTANT })
      : s.tier === "one_ok"
        ? t("uc.party.example.tier.one_ok", { instant: INSTANT, oneOk: ONE_OK })
        : t("uc.party.example.tier.group", { k: s.k, n: s.n, name: nameOf(s.by) })
  const head: Record<PartySpendId, string> = {
    house: t("uc.party.example.row.house", { name: nameOf(HOUSE.by) }),
    decorations: t("uc.party.example.row.decorations", { name: nameOf(DECORATIONS.by) }),
    dinner: t("uc.party.example.row.dinner", { name: nameOf(DINNER.by) }),
  }
  const spends: ExampleRow[] = [
    {
      id: "in",
      head: t("uc.party.example.row.in", { each: EACH }),
      sub: t("uc.party.example.row.in.sub", { n: W.people }),
      cells: [<MoneyText key="a" micro={W.total} sign="in" variant="inline" />, <MoneyText key="l" micro={W.total} variant="inline" />],
    },
    ...W.spends.map((s) => ({
      id: s.id,
      head: head[s.id],
      sub: tier(s),
      cells: [<MoneyText key="a" micro={s.amount} sign="out" variant="inline" />, <MoneyText key="l" micro={s.leftAfter} variant="inline" />],
    })),
  ]
  return (
    <Section id="example" labelledBy="example-title" band="sunken" className="dark:bg-ground">
      <SectionHead id="example-title" eyebrow={t("uc.party.example.eyebrow")} title={t("uc.party.example.title")} intro={t("uc.party.example.intro", { each: EACH })} />
      <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
        <ExampleTable
          className="lg:col-span-7 dark:ring-1 dark:ring-line"
          caption={t("uc.party.example.spends.caption")}
          columns={[
            { id: "what", label: t("uc.party.example.col.what") },
            { id: "amount", label: t("uc.party.example.col.amount"), numeric: true },
            { id: "left", label: t("uc.party.example.col.left"), numeric: true },
          ]}
          rows={spends}
          note={
            <span className="tabular-nums">
              {t("uc.party.example.check", {
                total: whole(W.total),
                house: whole(HOUSE.amount),
                decorations: whole(DECORATIONS.amount),
                dinner: whole(DINNER.amount),
                left: whole(W.left),
              })}
            </span>
          }
        />
        <ExampleTable
          className="lg:col-span-5 dark:ring-1 dark:ring-line"
          caption={t("uc.party.example.back.caption")}
          columns={[
            { id: "what", label: t("uc.party.example.back.col.what", { n: W.people }) },
            { id: "amount", label: t("uc.party.example.col.amount"), numeric: true },
          ]}
          rows={[
            { id: "in", head: t("uc.party.example.back.row.in"), cells: [<MoneyText key="a" micro={W.each} variant="inline" />] },
            {
              id: "spent",
              head: t("uc.party.example.back.row.spent"),
              cells: [<MoneyText key="a" micro={W.each - W.eachBack} sign="out" variant="inline" />],
            },
          ]}
          foot={{ head: t("uc.party.example.back.row.back"), cells: [<MoneyText key="a" micro={W.eachBack} variant="inline" />] }}
          note={t("uc.party.example.back.note", { left: whole(W.left), each: formatUsd(W.eachBack) })}
        />
      </div>
    </Section>
  )
}

function Etiquette() {
  return (
    <Section id="etiquette" labelledBy="etiquette-title">
      <SectionHead id="etiquette-title" eyebrow={t("uc.party.etiquette.eyebrow")} title={t("uc.party.etiquette.title")} intro={t("uc.party.etiquette.intro")} />
      <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 lg:gap-6" data-etiquette>
          <IconCard Icon={Scale} title={t("uc.party.etiquette.amount.title")} body={t("uc.party.etiquette.amount.body")} />
          <IconCard Icon={HandHeart} title={t("uc.party.etiquette.honour.title")} body={t("uc.party.etiquette.honour.body")} />
          <IconCard Icon={Users} title={t("uc.party.etiquette.lighter.title")} body={t("uc.party.etiquette.lighter.body")} />
          <IconCard Icon={Eye} title={t("uc.party.etiquette.visible.title")} body={t("uc.party.etiquette.visible.body")} />
          <IconCard Icon={CalendarClock} title={t("uc.party.etiquette.after.title")} body={t("uc.party.etiquette.after.body")} />
        {/* the US and UK words side by side: the grid's sixth cell, sunken, quotable on its own */}
        <li className="rounded-lg bg-surface-sunken p-4 md:p-6 dark:bg-surface dark:ring-1 dark:ring-line" data-words>
          <h3 className="font-display text-heading text-ink">{t("uc.party.words.title")}</h3>
          <p className="mt-2 text-body text-ink-muted">{t("uc.party.words.body")}</p>
        </li>
      </ul>
    </Section>
  )
}

function Rules() {
  return (
    <Section id="rules" labelledBy="rules-title">
      <SectionHead id="rules-title" eyebrow={t("uc.party.rules.eyebrow")} title={t("uc.party.rules.title")} intro={t("uc.party.rules.intro")} />
      <RulesFit
        items={[
          {
            id: "weekend",
            Icon: PartyPopper,
            title: t("uc.party.rules.weekend.title"),
            rule: t("uc.party.rules.weekend.rule", { instant: INSTANT, perPerson: PER_PERSON }),
            body: t("uc.party.rules.weekend.body", { oneOk: ONE_OK }),
          },
          {
            id: "goal",
            Icon: Target,
            title: t("uc.party.rules.goal.title"),
            rule: t("uc.party.rules.goal.rule", { goal: whole(W.total) }),
            body: t("uc.party.rules.goal.body"),
          },
          {
            id: "honour",
            Icon: HandHeart,
            title: t("uc.party.rules.honour.title"),
            rule: t("uc.party.rules.honour.rule", { each: EACH }),
            body: t("uc.party.rules.honour.body"),
          },
        ]}
      />
    </Section>
  )
}
