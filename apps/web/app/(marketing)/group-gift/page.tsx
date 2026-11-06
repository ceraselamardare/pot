// /group-gift: "collect money for a group gift" (page-plan.md; copy uc.gift.*). Hero (one OK paying back whoever
// bought the gift, with family's money from outside in the activity) → the problem, and plainly what a Pot does and
// doesn't do (no group card, no gift card) → five steps beside the pay-in link family gets → the wording to send
// (ready to copy) → the Project Thirty worked example to the cent, money from outside included
// (lib/marketing/group-gift.ts, the app's own rule and close-out math) → rules that fit → FAQ (also the FAQPage
// JSON-LD) → related → final CTA. Static (Cache Components: no request APIs); the only client code is the tiny copy
// button. The hero's [Start a Pot] is the page's one marigold button.
import { CalendarClock, Gift, Link as LinkIcon } from "lucide-react"
import type { Metadata } from "next"
import { Section, SectionHead } from "@/components/landing/home/Section"
import { ExampleTable, type ExampleRow } from "@/components/marketing/ExampleTable"
import { Faq, faqItem } from "@/components/marketing/Faq"
import { GIFT_PEOPLE, nameOf, OUTSIDERS } from "@/components/marketing/group-gift/cast"
import { CopyMessage } from "@/components/marketing/group-gift/CopyMessage"
import { GiftVisual, OK_BY } from "@/components/marketing/group-gift/GiftVisual"
import { PayInCard } from "@/components/marketing/group-gift/PayInCard"
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
import { EXAMPLE_EXTRAS, EXAMPLE_RULES } from "@/lib/marketing/example-math"
import { GIFT_EACH, GIFT_OUTSIDE, NORA_GIFT, type GiftSpend, type GiftSpendId } from "@/lib/marketing/group-gift"
import { pageMeta } from "@/lib/marketing/meta"
import { marketingPage } from "@/lib/marketing/pages"
import { breadcrumbs, faqPage, graph, homeCrumb, webPage } from "@/lib/marketing/schema"

const PATH = "/group-gift"
export const metadata: Metadata = pageMeta(PATH)

const whole = (m: Micro) => formatUsd(m, "whole")
const INSTANT = whole(EXAMPLE_RULES.instantCap) // $100
const ONE_OK = whole(EXAMPLE_EXTRAS.oneOkCap) // $300
const EACH = whole(GIFT_EACH) // $40
/** a pay-in link takes $1-$10,000 per payment (apps/web/lib/gifts.ts) */
const PAYIN = { min: whole(dollars(1)), max: whole(dollars(10_000)) }
const W = NORA_GIFT
const spend = (id: GiftSpendId) => W.spends.find((s) => s.id === id)!
const GIFT = spend("gift")
const CAKE = spend("cake")
/** the money from outside, in the order it came in, with what's in the Pot after each */
const OUTSIDE_IN = GIFT_OUTSIDE.map((g, i) => ({
  ...g,
  leftAfter: W.membersIn + GIFT_OUTSIDE.slice(0, i + 1).reduce((a, x) => a + x.amount, 0n),
}))

const FAQ = [
  faqItem("best", t("uc.gift.faq.best.q"), t("uc.gift.faq.best.a")),
  faqItem("much", t("uc.gift.faq.much.q"), t("uc.gift.faq.much.a")),
  faqItem("outside", t("uc.gift.faq.outside.q"), t("uc.gift.faq.outside.a", PAYIN), t("uc.common.signin_today")),
  faqItem("see", t("uc.gift.faq.see.q"), t("uc.gift.faq.see.a")),
  faqItem("over", t("uc.gift.faq.over.q"), t("uc.gift.faq.over.a")),
  faqItem("card", t("uc.gift.faq.card.q"), t("uc.gift.faq.card.a")),
  faqItem("free", t("uc.gift.faq.free.q"), t("uc.gift.faq.free.a")),
  faqItem("real", t("uc.gift.faq.real.q"), t("uc.gift.faq.real.a")),
]

const page = marketingPage(PATH)
const STRUCTURED_DATA = graph(
  webPage({ path: PATH, name: t(page.titleKey), description: t(page.descriptionKey), dateModified: page.lastModified, datePublished: "2026-11-06" }),
  breadcrumbs([homeCrumb(), { name: t("uc.gift.crumb"), path: PATH }]),
  faqPage({ path: PATH, items: FAQ.map(({ question, answer }) => ({ question, answer })) }),
)

export default function GroupGiftPage() {
  return (
    <>
      <JsonLd data={STRUCTURED_DATA} />
      <UseCaseHero eyebrow={t("uc.gift.hero.eyebrow")} title={t("uc.gift.hero.title")} subhead={t("uc.gift.hero.subhead")} visual={<GiftVisual />} />
      <Problem />
      <HowTo />
      <Wording />
      <WorkedExample />
      <Rules />
      <Faq title={t("uc.gift.faq.title")} items={FAQ} />
      <RelatedLinks current={PATH} />
      <UseCaseFinal title={t("uc.gift.final.title")} body={t("uc.gift.final.body")} />
    </>
  )
}

function Problem() {
  const list = (title: string, items: string[], id: string) => (
    <div className="rounded-lg bg-surface p-4 shadow-card md:p-6" data-scope={id}>
      <h3 className="font-display text-heading text-ink">{title}</h3>
      <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-body text-ink-muted marker:text-ink-muted">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  )
  return (
    <Section id="problem" labelledBy="problem-title">
      <SectionHead id="problem-title" eyebrow={t("uc.gift.problem.eyebrow")} title={t("uc.gift.problem.title", { each: EACH })} intro={t("uc.gift.problem.body")} />
      <div className="grid gap-3 md:grid-cols-2 lg:gap-6">
        {list(
          t("uc.gift.scope.does.title"),
          [t("uc.gift.scope.does.chat"), t("uc.gift.scope.does.outside"), t("uc.gift.scope.does.payback"), t("uc.gift.scope.does.back")],
          "does",
        )}
        {list(t("uc.gift.scope.doesnt.title"), [t("uc.gift.scope.doesnt.card"), t("uc.gift.scope.doesnt.giftcard"), t("uc.gift.scope.doesnt.buy")], "doesnt")}
      </div>
    </Section>
  )
}

function HowTo() {
  return (
    <Section id="how" labelledBy="how-title">
      <SectionHead id="how-title" eyebrow={t("uc.gift.how.eyebrow")} title={t("uc.gift.how.title")} intro={t("uc.gift.how.intro")} />
      <Steps
        steps={[
          { title: t("uc.gift.how.s1.title"), body: t("uc.gift.how.s1.body", { each: EACH }) },
          { title: t("uc.gift.how.s2.title"), body: t("uc.gift.how.s2.body", { each: EACH }) },
          { title: t("uc.gift.how.s3.title"), body: t("uc.gift.how.s3.body", PAYIN) },
          { title: t("uc.gift.how.s4.title"), body: t("uc.gift.how.s4.body", { instant: INSTANT, oneOk: ONE_OK }) },
          { title: t("uc.gift.how.s5.title"), body: t("uc.gift.how.s5.body", { instant: INSTANT }) },
        ]}
        aside={<PayInCard />}
      />
    </Section>
  )
}

/** Two ready-made messages (the "collecting money for a group gift wording" query): shown as text, copyable with JS. */
function Wording() {
  const messages = [
    { id: "chat", label: t("uc.gift.wording.chat.label"), text: t("uc.gift.wording.chat.text", { each: EACH }) },
    { id: "family", label: t("uc.gift.wording.family.label"), text: t("uc.gift.wording.family.text") },
  ]
  return (
    <Section id="wording" labelledBy="wording-title" band="sunken" className="dark:bg-ground">
      <SectionHead id="wording-title" eyebrow={t("uc.gift.wording.eyebrow")} title={t("uc.gift.wording.title")} intro={t("uc.gift.wording.intro")} />
      <ul className="grid gap-3 lg:grid-cols-2 lg:gap-6" data-wording>
        {messages.map((m) => (
          <li key={m.id} className="flex flex-col rounded-lg bg-surface p-4 shadow-card md:p-6 dark:ring-1 dark:ring-line">
            <h3 id={`wording-${m.id}`} className="font-display text-heading text-ink">
              {m.label}
            </h3>
            {/* the message as a chat bubble: plain, selectable text */}
            <blockquote className="mt-3 flex-1 rounded-[1.125rem] rounded-bl-md bg-surface-sunken px-4 py-3 text-body text-ink dark:bg-ground" data-message={m.id}>
              <p>{m.text}</p>
            </blockquote>
            <div className="mt-3 flex min-h-11 justify-end">
              <CopyMessage
                text={m.text}
                label={t("uc.gift.wording.copy")}
                done={t("uc.gift.wording.copied")}
                failed={t("uc.gift.wording.copy_failed")}
                describedBy={`wording-${m.id}`}
              />
            </div>
          </li>
        ))}
      </ul>
    </Section>
  )
}

function WorkedExample() {
  const okBy = nameOf(OK_BY)
  const tier = (s: GiftSpend) =>
    s.tier === "instant"
      ? t("uc.gift.example.tier.instant", { instant: INSTANT })
      : t("uc.gift.example.tier.one_ok", { instant: INSTANT, oneOk: ONE_OK, name: okBy })
  const head: Record<GiftSpendId, string> = {
    gift: t("uc.gift.example.row.gift", { name: nameOf(GIFT.by) }),
    cake: t("uc.gift.example.row.cake", { name: nameOf(CAKE.by) }),
  }
  const rows: ExampleRow[] = [
    {
      id: "in",
      head: t("uc.gift.example.row.in", { each: EACH }),
      sub: t("uc.gift.example.row.in.sub", { n: W.people }),
      cells: [<MoneyText key="a" micro={W.membersIn} sign="in" variant="inline" />, <MoneyText key="l" micro={W.membersIn} variant="inline" />],
    },
    ...OUTSIDE_IN.map((g) => {
      const who = OUTSIDERS[g.id]
      return {
        id: g.id,
        head: t("uc.gift.example.row.outside", { name: who.name }),
        sub: who.who,
        cells: [<MoneyText key="a" micro={g.amount} sign="in" variant="inline" />, <MoneyText key="l" micro={g.leftAfter} variant="inline" />],
      }
    }),
    ...W.spends.map((s) => ({
      id: s.id,
      head: head[s.id],
      sub: tier(s),
      cells: [<MoneyText key="a" micro={s.amount} sign="out" variant="inline" />, <MoneyText key="l" micro={s.leftAfter} variant="inline" />],
    })),
  ]
  return (
    <Section id="example" labelledBy="example-title">
      <SectionHead
        id="example-title"
        eyebrow={t("uc.gift.example.eyebrow")}
        title={t("uc.gift.example.title")}
        intro={t("uc.gift.example.intro", { each: EACH, outside: whole(W.outside) })}
      />
      <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
        <ExampleTable
          className="lg:col-span-7 dark:ring-1 dark:ring-line"
          caption={t("uc.gift.example.spends.caption")}
          columns={[
            { id: "what", label: t("uc.gift.example.col.what") },
            { id: "amount", label: t("uc.gift.example.col.amount"), numeric: true },
            { id: "left", label: t("uc.gift.example.col.left"), numeric: true },
          ]}
          rows={rows}
          note={
            <span className="tabular-nums">
              {t("uc.gift.example.check", { total: whole(W.total), gift: whole(GIFT.amount), cake: whole(CAKE.amount), left: whole(W.left) })}
            </span>
          }
        />
        <ExampleTable
          className="lg:col-span-5 dark:ring-1 dark:ring-line"
          caption={t("uc.gift.example.back.caption")}
          columns={[
            { id: "person", label: t("close.table.person") },
            { id: "in", label: t("close.table.put_in"), numeric: true },
            { id: "back", label: t("close.table.gets_back"), numeric: true },
          ]}
          rows={W.shares.map((s) => ({
            id: s.id,
            head: (
              <span className="flex items-center gap-2">
                <Avatar person={GIFT_PEOPLE[s.id]} size="xs" />
                {nameOf(s.id)}
              </span>
            ),
            cells: [<MoneyText key="i" micro={s.putIn} variant="inline" />, <MoneyText key="b" micro={s.getsBack} variant="inline" />],
          }))}
          foot={{
            head: t("close.table.total"),
            cells: [<MoneyText key="i" micro={W.membersIn} variant="inline" />, <MoneyText key="b" micro={W.left} variant="inline" />],
          }}
          note={t("uc.gift.example.back.note", { each: formatUsd(W.eachBack), outside: whole(W.outside) })}
        />
      </div>
    </Section>
  )
}

function Rules() {
  return (
    <Section id="rules" labelledBy="rules-title" band="sunken" className="dark:bg-ground">
      <SectionHead id="rules-title" eyebrow={t("uc.gift.rules.eyebrow")} title={t("uc.gift.rules.title")} intro={t("uc.gift.rules.intro")} />
      <RulesFit
        items={[
          {
            id: "defaults",
            Icon: Gift,
            title: t("uc.gift.rules.defaults.title"),
            rule: t("uc.gift.rules.defaults.rule", { instant: INSTANT, oneOk: ONE_OK }),
            body: t("uc.gift.rules.defaults.body", { oneOk: ONE_OK }),
          },
          {
            id: "outside",
            Icon: LinkIcon,
            title: t("uc.gift.rules.outside.title"),
            rule: t("uc.gift.rules.outside.rule", PAYIN),
            body: t("uc.gift.rules.outside.body"),
          },
          {
            id: "goal",
            Icon: CalendarClock,
            title: t("uc.gift.rules.goal.title"),
            rule: t("uc.gift.rules.goal.rule", { goal: whole(W.total) }),
            body: t("uc.gift.rules.goal.body"),
          },
        ]}
      />
    </Section>
  )
}
