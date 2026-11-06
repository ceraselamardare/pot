// /tools/group-trip-cost-calculator: "group trip cost calculator" (page-plan "The tool"; copy uc.calc.*). A free
// tool page: the hero holds the calculator itself (its one client island, components/marketing/calculator), whose
// result carries the page's one marigold [Start a Pot] right under the amount each. Then the method in quotable
// steps beside the formula → a worked example to the cent ("A week abroad", the same numbers as that preset) →
// which costs need the group (a new Pot's rules) → FAQ (also the FAQPage JSON-LD) → related → final CTA.
// Static (Cache Components: no request APIs). The server renders the calculator with the default example, so the
// page has a full result without JS. Create can't take a suggested amount from a link, so the result says
// "Start a Pot and set $X each" in words and the button is the plain Start a Pot link.
import { Hand, ShoppingBasket, Users } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { SignInLink } from "@/components/features/auth/SignInLink"
import { Section, SectionHead } from "@/components/landing/home/Section"
import { Sticker } from "@/components/landing/home/Sticker"
import { type CalcCopy, TripCalculator } from "@/components/marketing/calculator/TripCalculator"
import { ExampleTable, type ExampleRow } from "@/components/marketing/ExampleTable"
import { Faq, faqItem } from "@/components/marketing/Faq"
import { RelatedLinks } from "@/components/marketing/RelatedLinks"
import { RulesFit } from "@/components/marketing/RulesFit"
import { Steps } from "@/components/marketing/Steps"
import { UseCaseFinal } from "@/components/marketing/UseCaseFinal"
import { JsonLd } from "@/components/seo/JsonLd"
import { buttonVariants } from "@/components/ui/button"
import en from "@/i18n/en.json"
import { t, type MessageKey } from "@/i18n/t"
import { cn } from "@/lib/client/cn"
import { pageMeta } from "@/lib/marketing/meta"
import { marketingPage } from "@/lib/marketing/pages"
import { breadcrumbs, faqPage, graph, homeCrumb, toolApplication, webPage } from "@/lib/marketing/schema"
import { approvalsNeeded, DEFAULT_PRESET, PRESETS, tripCost, usd, usdWhole, type CostLine } from "@/lib/marketing/trip-cost"
import { DEFAULT_LIMITS } from "@/lib/marketing/trip-cost-defaults"

const PATH = "/tools/group-trip-cost-calculator"
export const metadata: Metadata = pageMeta(PATH)

const RULES = DEFAULT_LIMITS
const INSTANT = usdWhole(RULES.instant) // $100
const PER_PERSON = usdWhole(RULES.perPerson) // $200
const ONE_OK = usdWhole(RULES.oneOk) // $300

/** The worked example: the "A week abroad" preset, worked out by the same function the calculator runs. */
const EX_IN = PRESETS.abroad
const EX = tripCost(EX_IN, RULES)

/** A raw en.json template (placeholders kept) for the client island; `form` picks a plural form. */
const TABLE = en as Record<string, string>
function tpl(key: MessageKey, form?: "one" | "other"): string {
  const s = TABLE[form ? `${key}#${form}` : key]
  if (s === undefined) throw new Error(`missing en.json key: ${key}`)
  return s
}

const COPY: CalcCopy = {
  formLabel: tpl("uc.calc.form.label"),
  presetsLabel: tpl("uc.calc.presets.label"),
  presets: { weekend: tpl("uc.calc.preset.weekend"), abroad: tpl("uc.calc.preset.abroad"), party: tpl("uc.calc.preset.party") },
  field: {
    people: tpl("uc.calc.field.people"),
    days: tpl("uc.calc.field.days"),
    stay: tpl("uc.calc.field.stay"),
    travel: tpl("uc.calc.field.travel"),
    food: tpl("uc.calc.field.food"),
    activities: tpl("uc.calc.field.activities"),
    cushion: tpl("uc.calc.field.cushion"),
  },
  percent: tpl("uc.calc.field.percent"),
  error: {
    people: tpl("uc.calc.error.people"),
    days: tpl("uc.calc.error.days"),
    money: tpl("uc.calc.error.money"),
    cushion: tpl("uc.calc.error.cushion"),
    summary: tpl("uc.calc.error.summary"),
  },
  resultTitle: tpl("uc.calc.result.title"),
  resultEach: tpl("uc.calc.result.each"),
  resultHow: tpl("uc.calc.result.how"),
  resultLive: tpl("uc.calc.result.live"),
  breakdownCaption: tpl("uc.calc.breakdown.caption"),
  colCost: tpl("uc.calc.col.cost"),
  colAmount: tpl("uc.calc.col.amount"),
  line: {
    stay: tpl("uc.calc.line.stay"),
    travel: tpl("uc.calc.line.travel"),
    foodOne: tpl("uc.calc.line.food", "one"),
    foodOther: tpl("uc.calc.line.food", "other"),
    activities: tpl("uc.calc.line.activities"),
    cushion: tpl("uc.calc.line.cushion"),
    cushionSub: tpl("uc.calc.line.cushion.sub"),
    rounding: tpl("uc.calc.line.rounding"),
    pot: tpl("uc.calc.line.pot"),
  },
  paid: { stay: tpl("uc.calc.paid.stay"), travel: tpl("uc.calc.paid.travel"), activities: tpl("uc.calc.paid.activities"), food: tpl("uc.calc.paid.food") },
  tier: { instant: tpl("uc.calc.tier.instant"), one_ok: tpl("uc.calc.tier.one_ok"), group: tpl("uc.calc.tier.group") },
  spare: tpl("uc.calc.spare"),
  rulesNote: tpl("uc.calc.rules.note"),
  rulesLink: tpl("uc.calc.rules.link"),
  ctaText: tpl("uc.calc.cta.text"),
}

const FAQ = [
  faqItem("howto", t("uc.calc.faq.howto.q"), t("uc.calc.faq.howto.a")),
  faqItem("cushion", t("uc.calc.faq.cushion.q"), t("uc.calc.faq.cushion.a")),
  faqItem("nights", t("uc.calc.faq.nights.q"), t("uc.calc.faq.nights.a")),
  faqItem("party", t("uc.calc.faq.party.q"), t("uc.calc.faq.party.a")),
  faqItem("rounding", t("uc.calc.faq.rounding.q"), t("uc.calc.faq.rounding.a")),
  faqItem("leftover", t("uc.calc.faq.leftover.q"), t("uc.calc.faq.leftover.a")),
  faqItem("free", t("uc.calc.faq.free.q"), t("uc.calc.faq.free.a"), t("uc.common.signin_today")),
  faqItem("real", t("uc.calc.faq.real.q"), t("uc.calc.faq.real.a")),
]

const page = marketingPage(PATH)
const STRUCTURED_DATA = graph(
  webPage({ path: PATH, name: t(page.titleKey), description: t(page.descriptionKey), dateModified: page.lastModified, datePublished: "2026-11-06" }),
  toolApplication({ path: PATH, name: t("uc.calc.hero.title"), description: t("uc.calc.hero.subhead"), category: "TravelApplication" }),
  breadcrumbs([homeCrumb(), { name: t("uc.calc.crumb"), path: PATH }]),
  faqPage({ path: PATH, items: FAQ.map(({ question, answer }) => ({ question, answer })) }),
)

export default function TripCostCalculatorPage() {
  return (
    <>
      <JsonLd data={STRUCTURED_DATA} />
      <ToolHero />
      <Method />
      <WorkedExample />
      <Rules />
      <Faq title={t("uc.calc.faq.title")} items={FAQ} />
      <RelatedLinks current={PATH} />
      <UseCaseFinal title={t("uc.calc.final.title")} body={t("uc.calc.final.body")} sticker="boat" />
    </>
  )
}

/**
 * The tool's hero: eyebrow, the page's one H1, the answer-first subhead, [See how it works] and the honest line,
 * with the calculator beside them from lg (below them on phones). The calculator's result holds the marigold.
 */
function ToolHero() {
  const notes = t("uc.calc.hero.note").split(" · ")
  return (
    <section aria-labelledby="uc-hero-title" className="overflow-x-clip" data-marketing-hero>
      <div className="mx-auto w-full max-w-app px-4 pt-6 md:px-6 md:pt-12 lg:grid lg:grid-cols-12 lg:items-start lg:gap-8 lg:py-12">
        <div className="relative lg:sticky lg:top-24 lg:col-span-5">
          <p className="text-label text-ink-muted">{t("uc.calc.hero.eyebrow")}</p>
          <h1
            id="uc-hero-title"
            className="mt-2 max-w-[14em] font-display text-[2.25rem] leading-10 font-extrabold tracking-[-0.02em] text-balance text-ink md:text-balance-hero"
          >
            {t("uc.calc.hero.title")}
          </h1>
          <p className="mt-4 max-w-flow text-body text-pretty text-ink-muted">{t("uc.calc.hero.subhead")}</p>
          <div className="mt-6 flex flex-col gap-3 xs:flex-row">
            <Link href="/demo" prefetch={false} className={cn(buttonVariants({ size: "lg" }), "w-full xs:w-auto sm:min-w-44")}>
              {t("uc.common.cta.demo")}
            </Link>
          </div>
          <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-body-sm text-ink-muted">
            {notes.map((n) => (
              <li key={n} className="whitespace-nowrap">
                {n}
              </li>
            ))}
          </ul>
          {/* lg: in the copy column's free space, over nothing */}
          <Sticker name="tickets" width={112} sizes="128px" rotate={-8} className="mt-10 ml-6 hidden w-28 lg:block" />
        </div>

        <div className="mt-8 lg:col-span-7 lg:mt-0">
          <TripCalculator
            copy={COPY}
            rules={RULES}
            initial={DEFAULT_PRESET}
            rulesHref="/#rules"
            cta={
              <SignInLink source="hero" className={cn(buttonVariants({ variant: "primary" }), "w-full shrink-0 sm:w-auto sm:min-w-44")}>
                {t("home.cta.start")}
              </SignInLink>
            }
          />
        </div>
      </div>
    </section>
  )
}

function Method() {
  return (
    <Section id="method" labelledBy="method-title">
      <SectionHead id="method-title" eyebrow={t("uc.calc.method.eyebrow")} title={t("uc.calc.method.title")} intro={t("uc.calc.method.intro")} />
      <Steps
        steps={[
          { title: t("uc.calc.method.s1.title"), body: t("uc.calc.method.s1.body") },
          { title: t("uc.calc.method.s2.title"), body: t("uc.calc.method.s2.body") },
          { title: t("uc.calc.method.s3.title"), body: t("uc.calc.method.s3.body") },
          { title: t("uc.calc.method.s4.title"), body: t("uc.calc.method.s4.body") },
        ]}
        aside={
          <figure className="rounded-lg bg-surface-sunken p-4 md:p-6 dark:bg-surface dark:ring-1 dark:ring-line" data-formula>
            <figcaption className="text-label text-ink-muted">{t("uc.calc.method.formula.label")}</figcaption>
            <p className="mt-2 font-display text-heading text-ink">{t("uc.calc.method.formula")}</p>
          </figure>
        }
      />
    </Section>
  )
}

function WorkedExample() {
  const head = (l: CostLine) =>
    l.id === "stay"
      ? t("uc.calc.line.stay")
      : l.id === "travel"
        ? t("uc.calc.line.travel", { each: usdWhole(EX_IN.travelEach), n: EX_IN.people })
        : l.id === "food"
          ? t("uc.calc.line.food", { each: usdWhole(EX_IN.foodEachPerDay), people: EX_IN.people, n: EX_IN.days })
          : t("uc.calc.line.activities")
  const paid = (l: CostLine) => (l.id === "food" ? t("uc.calc.paid.food", { daily: usdWhole(l.payment) }) : t(`uc.calc.paid.${l.id}`))
  const tier = (l: CostLine) =>
    !l.approval
      ? ""
      : l.approval.tier === "group"
        ? t("uc.calc.tier.group", { k: l.approval.k, n: l.approval.n })
        : t(l.approval.tier === "instant" ? "uc.calc.tier.instant" : "uc.calc.tier.one_ok")
  const amount = (cents: number) => <span className="tabular-nums" data-money>{usd(cents)}</span>
  const costs: ExampleRow[] = EX.lines.map((l) => ({
    id: l.id,
    head: head(l),
    sub: t("uc.calc.example.sub", { paid: paid(l), tier: tier(l) }),
    cells: [amount(l.total)],
  }))
  const withCushion = EX.tripCost + EX.cushion
  const split: ExampleRow[] = [
    { id: "cost", head: t("uc.calc.example.row.cost"), cells: [amount(EX.tripCost)] },
    { id: "cushion", head: t("uc.calc.example.row.cushion", { pct: EX_IN.cushionPct }), cells: [amount(EX.cushion)] },
    { id: "split", head: t("uc.calc.example.row.split", { n: EX_IN.people }), cells: [amount(Math.round(withCushion / EX_IN.people))] },
  ]
  return (
    <Section id="example" labelledBy="example-title" band="sunken" className="dark:bg-ground">
      <SectionHead
        id="example-title"
        eyebrow={t("uc.calc.example.eyebrow")}
        title={t("uc.calc.example.title")}
        intro={t("uc.calc.example.intro", {
          stay: usdWhole(EX_IN.stay),
          travel: usdWhole(EX_IN.travelEach),
          food: usdWhole(EX_IN.foodEachPerDay),
          activities: usdWhole(EX_IN.activities),
          pct: EX_IN.cushionPct,
        })}
      />
      <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
        <ExampleTable
          className="lg:col-span-7 dark:ring-1 dark:ring-line"
          caption={t("uc.calc.example.costs.caption")}
          columns={[
            { id: "cost", label: t("uc.calc.col.cost") },
            { id: "amount", label: t("uc.calc.col.amount"), numeric: true },
          ]}
          rows={costs}
          foot={{ head: t("uc.calc.example.row.cost"), cells: [amount(EX.tripCost)] }}
        />
        <ExampleTable
          className="lg:col-span-5 dark:ring-1 dark:ring-line"
          caption={t("uc.calc.example.each.caption")}
          columns={[
            { id: "step", label: t("uc.calc.col.step") },
            { id: "amount", label: t("uc.calc.col.amount"), numeric: true },
          ]}
          rows={split}
          foot={{ head: t("uc.calc.example.row.each"), cells: [amount(EX.each)] }}
          note={
            <span className="tabular-nums">
              {t("uc.calc.example.note", {
                each: usdWhole(EX.each),
                n: EX_IN.people,
                pot: usdWhole(EX.pot),
                spare: usdWhole(EX.spare),
                cushion: usdWhole(EX.cushion),
                rounding: usdWhole(EX.rounding),
              })}
            </span>
          }
        />
      </div>
    </Section>
  )
}

function Rules() {
  return (
    <Section id="rules" labelledBy="rules-title">
      <SectionHead id="rules-title" eyebrow={t("uc.calc.rules.eyebrow")} title={t("uc.calc.rules.title")} intro={t("uc.calc.rules.intro")} />
      <RulesFit
        items={[
          {
            id: "instant",
            Icon: ShoppingBasket,
            title: t("uc.calc.rules.instant.title"),
            rule: t("uc.calc.rules.instant.rule", { instant: INSTANT, perPerson: PER_PERSON }),
            body: t("uc.calc.rules.instant.body"),
          },
          {
            id: "one_ok",
            Icon: Hand,
            title: t("uc.calc.rules.one_ok.title"),
            rule: t("uc.calc.rules.one_ok.rule", { oneOk: ONE_OK }),
            body: t("uc.calc.rules.one_ok.body"),
          },
          {
            id: "group",
            Icon: Users,
            title: t("uc.calc.rules.group.title"),
            rule: t("uc.calc.rules.group.rule", { k4: approvalsNeeded(4), k6: approvalsNeeded(6), k8: approvalsNeeded(8) }),
            body: t("uc.calc.rules.group.body"),
          },
        ]}
      />
    </Section>
  )
}
