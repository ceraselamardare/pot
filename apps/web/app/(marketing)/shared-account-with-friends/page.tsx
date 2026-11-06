// /shared-account-with-friends: "shared account with friends" (page-plan; copy uc.shared.*). The trend closest to
// what Pot is: one shared pot of money the group controls with rules, without a joint bank account. Said plainly and
// early: Pot is not a bank account, and for now it runs on test money.
// Hero (The Crew's Pot with its rules, and a request waiting for the group) → the problem and a question-by-question
// comparison (joint bank account / one friend holds it / a Pot; the joint-account claim cited to the CFPB) → what
// Pot is and isn't → five steps beside "Who can see what" (product.md §1.20, in plain words) → The Crew worked
// example, different amounts in, shared back in proportion (lib/marketing/shared-account.ts) → who it's for → rules
// that fit → FAQ (also the FAQPage JSON-LD) → related → final CTA.
// Static (Cache Components: no request APIs). The hero's [Start a Pot] is the page's one marigold button.
import { ArrowRight, Cake, Eye, House, Minus, Plane, Plus, ShoppingBasket, Sprout, Trophy, UserRoundCheck, Users } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { Section, SectionHead } from "@/components/landing/home/Section"
import { Sticker } from "@/components/landing/home/Sticker"
import { ExampleTable, type ExampleRow } from "@/components/marketing/ExampleTable"
import { Faq, faqItem } from "@/components/marketing/Faq"
import { RelatedLinks } from "@/components/marketing/RelatedLinks"
import { RulesFit } from "@/components/marketing/RulesFit"
import { AccountCompare } from "@/components/marketing/shared-account/AccountCompare"
import { CREW_PEOPLE, crewName } from "@/components/marketing/shared-account/cast"
import { CrewVisual } from "@/components/marketing/shared-account/CrewVisual"
import { Steps } from "@/components/marketing/Steps"
import { UseCaseFinal } from "@/components/marketing/UseCaseFinal"
import { UseCaseHero } from "@/components/marketing/UseCaseHero"
import { MoneyText } from "@/components/money/MoneyText"
import { Avatar } from "@/components/pot/Avatar"
import { JsonLd } from "@/components/seo/JsonLd"
import { t } from "@/i18n/t"
import { dollars, formatUsd, type Micro } from "@/lib/client/money"
import { pageMeta } from "@/lib/marketing/meta"
import { marketingPage } from "@/lib/marketing/pages"
import { breadcrumbs, faqPage, graph, homeCrumb, webPage } from "@/lib/marketing/schema"
import { CREW_EXTRAS, CREW_PUT_IN, CREW_RULES, THE_CREW, type CrewSpend } from "@/lib/marketing/shared-account"
import { HUB_LIMITS, WAVE4_LIMITS } from "@pot/sdk"

const PATH = "/shared-account-with-friends"
export const metadata: Metadata = pageMeta(PATH)

/** The source for the one specific joint-account claim (who can take money out), checked 2026-11-06. */
const CFPB_URL =
  "https://www.consumerfinance.gov/ask-cfpb/i-have-a-joint-checking-account-with-another-person-they-transferred-all-the-money-out-of-the-account-and-into-their-own-private-account-without-my-permission-they-then-closed-the-account-can-they-do-that-en-1099/"

const whole = (m: Micro) => formatUsd(m, "whole")
const INSTANT = whole(CREW_RULES.instantCap) // $100
const PER_PERSON = whole(CREW_RULES.memberBudget) // $200
const ONE_OK = whole(CREW_EXTRAS.oneOkCap) // $300
const MAX_PEOPLE = HUB_LIMITS.maxMembers // 40
/** Trust grows: every 3 paid spends raise the instant limit by the base, up to 3 × it */
const TRUST = { step: WAVE4_LIMITS.trustStep, max: whole(CREW_RULES.instantCap * BigInt(WAVE4_LIMITS.trustMaxLevel + 1)) }
/** "a house kitty": within the app's limits (instant ≤ $1,000, per person ≥ instant) */
const HOUSE = { instant: whole(dollars(50)), perPerson: whole(dollars(150)) }
const W = THE_CREW
const spend = (id: CrewSpend["id"]) => W.spends.find((s) => s.id === id)!
const SNACKS = spend("snacks")
const TICKETS = spend("tickets")
const LAKE = spend("house")

const FAQ = [
  faqItem("joint", t("uc.shared.faq.joint.q"), t("uc.shared.faq.joint.a")),
  faqItem("bank", t("uc.shared.faq.bank.q"), t("uc.shared.faq.bank.a"), t("uc.common.signin_today")),
  faqItem("control", t("uc.shared.faq.control.q"), t("uc.shared.faq.control.a", { instant: INSTANT, perPerson: PER_PERSON, oneOk: ONE_OK })),
  faqItem("takeall", t("uc.shared.faq.takeall.q"), t("uc.shared.faq.takeall.a", { perPerson: PER_PERSON })),
  faqItem("done", t("uc.shared.faq.done.q"), t("uc.shared.faq.done.a")),
  faqItem("private", t("uc.shared.faq.private.q"), t("uc.shared.faq.private.a")),
  faqItem("free", t("uc.shared.faq.free.q"), t("uc.shared.faq.free.a")),
  faqItem("real", t("uc.shared.faq.real.q"), t("uc.shared.faq.real.a")),
]

const page = marketingPage(PATH)
const STRUCTURED_DATA = graph(
  webPage({ path: PATH, name: t(page.titleKey), description: t(page.descriptionKey), dateModified: page.lastModified, datePublished: "2026-11-06" }),
  breadcrumbs([homeCrumb(), { name: t("uc.shared.crumb"), path: PATH }]),
  faqPage({ path: PATH, items: FAQ.map(({ question, answer }) => ({ question, answer })) }),
)

export default function SharedAccountPage() {
  return (
    <>
      <JsonLd data={STRUCTURED_DATA} />
      <UseCaseHero
        eyebrow={t("uc.shared.hero.eyebrow")}
        title={t("uc.shared.hero.title")}
        subhead={t("uc.shared.hero.subhead")}
        visual={<CrewVisual />}
      />
      <Problem />
      <WhatItIs />
      <HowTo />
      <WorkedExample />
      <WhoFor />
      <Rules />
      <Faq title={t("uc.shared.faq.title")} items={FAQ} />
      <RelatedLinks current={PATH} />
      <UseCaseFinal title={t("uc.shared.final.title")} body={t("uc.shared.final.body")} sticker="pastel" />
    </>
  )
}

function Problem() {
  const q = (id: "control" | "takeall" | "see" | "end" | "open" | "people") => ({
    id,
    question: t(`uc.shared.compare.${id}.q`),
    answers: [
      t(`uc.shared.compare.${id}.joint`),
      t(`uc.shared.compare.${id}.friend`),
      id === "takeall"
        ? t("uc.shared.compare.takeall.pot", { perPerson: PER_PERSON })
        : id === "people"
          ? t("uc.shared.compare.people.pot", { max: MAX_PEOPLE })
          : t(`uc.shared.compare.${id}.pot`),
    ],
  })
  return (
    <Section id="problem" labelledBy="problem-title">
      <SectionHead id="problem-title" eyebrow={t("uc.shared.problem.eyebrow")} title={t("uc.shared.problem.title")} intro={t("uc.shared.problem.body")} />
      <AccountCompare
        caption={t("uc.shared.compare.caption")}
        questionLabel={t("uc.shared.compare.col.question")}
        ways={[
          { id: "joint", name: t("uc.shared.compare.joint.name") },
          { id: "friend", name: t("uc.shared.compare.friend.name") },
          { id: "pot", name: t("uc.shared.compare.pot.name"), ours: true },
        ]}
        questions={[q("control"), q("takeall"), q("see"), q("end"), q("open"), q("people")]}
      />
      <div className="mt-4 flex max-w-flow flex-col gap-2 text-body-sm text-ink-muted lg:max-w-[44rem]" data-source>
        <p>{t("uc.shared.compare.note")}</p>
        <p>
          {t("uc.shared.compare.source")}
          <a href={CFPB_URL} rel="noopener" className="ml-1 text-link underline underline-offset-4">
            {t("uc.shared.compare.source.link")}
          </a>
        </p>
      </div>
    </Section>
  )
}

function WhatItIs() {
  const is = ["rules", "web", "free"] as const
  const isnt = ["bank", "real", "out"] as const
  return (
    <Section id="what" labelledBy="what-title" band="sunken" className="dark:bg-ground">
      <SectionHead id="what-title" eyebrow={t("uc.shared.isnt.eyebrow")} title={t("uc.shared.isnt.title")} />
      <div className="grid gap-3 md:grid-cols-2 lg:gap-6">
        <div className="rounded-lg bg-surface p-4 shadow-card md:p-6 dark:ring-1 dark:ring-line" data-pot-is>
          <h3 className="font-display text-heading text-ink">{t("uc.shared.isnt.is.title")}</h3>
          <ul className="mt-3 flex flex-col gap-3">
            {is.map((k) => (
              <li key={k} className="flex items-start gap-3 text-body text-ink">
                <Plus aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-muted" strokeWidth={2} />
                <span className="min-w-0">{t(`uc.shared.isnt.is.${k}`)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg bg-surface p-4 shadow-card md:p-6 dark:ring-1 dark:ring-line" data-pot-isnt>
          <h3 className="font-display text-heading text-ink">{t("uc.shared.isnt.not.title")}</h3>
          <ul className="mt-3 flex flex-col gap-3">
            {isnt.map((k) => (
              <li key={k} className="flex items-start gap-3 text-body text-ink">
                <Minus aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-muted" strokeWidth={2} />
                <span className="min-w-0">{t(`uc.shared.isnt.not.${k}`)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  )
}

function HowTo() {
  return (
    <Section id="how" labelledBy="how-title">
      <SectionHead id="how-title" eyebrow={t("uc.shared.how.eyebrow")} title={t("uc.shared.how.title")} intro={t("uc.shared.how.intro")} />
      <Steps
        steps={[
          { title: t("uc.shared.how.s1.title"), body: t("uc.shared.how.s1.body", { instant: INSTANT, perPerson: PER_PERSON }) },
          { title: t("uc.shared.how.s2.title"), body: t("uc.shared.how.s2.body", { max: MAX_PEOPLE }) },
          { title: t("uc.shared.how.s3.title"), body: t("uc.shared.how.s3.body") },
          { title: t("uc.shared.how.s4.title"), body: t("uc.shared.how.s4.body", { oneOk: ONE_OK }) },
          { title: t("uc.shared.how.s5.title"), body: t("uc.shared.how.s5.body") },
        ]}
        aside={<WhoCanSee />}
      />
    </Section>
  )
}

/** Beside the steps: who can see what (product.md §1.20), in plain words. Real text, not a picture. */
function WhoCanSee() {
  return (
    <aside aria-labelledby="privacy-title" className="rounded-lg bg-surface-sunken p-4 md:p-6 dark:bg-surface dark:ring-1 dark:ring-line" data-privacy>
      <h3 id="privacy-title" className="font-display text-heading text-ink">
        {t("uc.shared.privacy.title")}
      </h3>
      <p className="mt-2 text-body-sm text-ink-muted">{t("uc.shared.privacy.intro")}</p>
      <dl className="mt-4 flex flex-col gap-4">
        <div>
          <dt className="flex items-start gap-3 text-label text-ink">
            <Eye aria-hidden className="mt-0.5 size-5 shrink-0" strokeWidth={2} />
            {t("uc.shared.privacy.public.title")}
          </dt>
          <dd className="mt-1 pl-8 text-body-sm text-ink-muted">{t("uc.shared.privacy.public.body")}</dd>
        </div>
        <div>
          <dt className="flex items-start gap-3 text-label text-ink">
            <UserRoundCheck aria-hidden className="mt-0.5 size-5 shrink-0" strokeWidth={2} />
            {t("uc.shared.privacy.members.title")}
          </dt>
          <dd className="mt-1 pl-8 text-body-sm text-ink-muted">{t("uc.shared.privacy.members.body")}</dd>
        </div>
      </dl>
    </aside>
  )
}

function WorkedExample() {
  const tier = (s: CrewSpend) =>
    s.tier === "instant"
      ? t("uc.shared.example.tier.instant", { instant: INSTANT })
      : s.tier === "one_ok"
        ? t("uc.shared.example.tier.one_ok", { instant: INSTANT, oneOk: ONE_OK })
        : t("uc.shared.example.tier.group", { k: s.k, n: s.n, name: crewName(s.by) })
  const head = {
    snacks: t("uc.shared.example.row.snacks", { name: crewName(SNACKS.by) }),
    tickets: t("uc.shared.example.row.tickets", { name: crewName(TICKETS.by) }),
    house: t("uc.shared.example.row.house", { name: crewName(LAKE.by) }),
  }
  const spends: ExampleRow[] = [
    {
      id: "in",
      head: t("uc.shared.example.row.in"),
      sub: t("uc.shared.example.row.in.sub", { n: W.people, total: whole(W.total) }),
      cells: [<MoneyText key="a" micro={W.total} sign="in" variant="inline" />, <MoneyText key="l" micro={W.total} variant="inline" />],
    },
    ...W.spends.map((s) => ({
      id: s.id,
      head: head[s.id],
      sub: tier(s),
      cells: [<MoneyText key="a" micro={s.amount} sign="out" variant="inline" />, <MoneyText key="l" micro={s.leftAfter} variant="inline" />],
    })),
  ]
  const last = CREW_PEOPLE[W.lastContributor]
  const lastShare = W.shares.find((s) => s.id === W.lastContributor)!
  const evenShare = W.shares.find((s) => s.id === "kit")! // put in the same as Lou, so Lou's extra is the remainder
  return (
    <Section id="example" labelledBy="example-title" band="sunken" className="dark:bg-ground">
      <SectionHead
        id="example-title"
        eyebrow={t("uc.shared.example.eyebrow")}
        title={t("uc.shared.example.title")}
        intro={t("uc.shared.example.intro", { big: whole(CREW_PUT_IN.jo), small: whole(CREW_PUT_IN.dev), mid: whole(CREW_PUT_IN.kit) })}
      />
      <div className="relative grid gap-6 lg:grid-cols-12 lg:items-start">
        <Sticker name="receipt" width={96} sizes="128px" rotate={-8} className="absolute -top-44 right-10 hidden w-24 lg:block" />
        <ExampleTable
          className="lg:col-span-7 dark:ring-1 dark:ring-line"
          caption={t("uc.shared.example.spends.caption")}
          columns={[
            { id: "what", label: t("uc.shared.example.col.what") },
            { id: "amount", label: t("uc.shared.example.col.amount"), numeric: true },
            { id: "left", label: t("uc.shared.example.col.left"), numeric: true },
          ]}
          rows={spends}
          note={
            <span className="tabular-nums">
              {t("uc.shared.example.check", {
                total: whole(W.total),
                snacks: whole(SNACKS.amount),
                tickets: whole(TICKETS.amount),
                house: whole(LAKE.amount),
                left: whole(W.left),
              })}
            </span>
          }
        />
        <ExampleTable
          className="lg:col-span-5 dark:ring-1 dark:ring-line"
          caption={t("uc.shared.example.back.caption")}
          columns={[
            { id: "person", label: t("close.table.person") },
            { id: "in", label: t("close.table.put_in"), numeric: true },
            { id: "back", label: t("close.table.gets_back"), numeric: true },
          ]}
          rows={W.shares.map((s) => ({
            id: s.id,
            head: (
              <span className="flex items-center gap-2">
                <Avatar person={CREW_PEOPLE[s.id]} size="xs" />
                {crewName(s.id)}
              </span>
            ),
            cells: [<MoneyText key="i" micro={s.putIn} variant="inline" />, <MoneyText key="b" micro={s.getsBack} variant="inline" />],
          }))}
          foot={{
            head: t("close.table.total"),
            cells: [<MoneyText key="i" micro={W.total} variant="inline" />, <MoneyText key="b" micro={W.left} variant="inline" />],
          }}
          note={
            <span className="tabular-nums">
              {t("uc.shared.example.back.note", {
                left: whole(W.left),
                remainder: formatUsd(lastShare.getsBack - evenShare.getsBack),
                name: last.name,
              })}
            </span>
          }
        />
      </div>
    </Section>
  )
}

function WhoFor() {
  const items = [
    { id: "trip", Icon: Plane, link: { href: "/group-trip", label: t("uc.shared.who.trip.link") } },
    { id: "house", Icon: House },
    { id: "club", Icon: Trophy },
    { id: "family", Icon: Cake },
  ] as const
  return (
    <Section id="who" labelledBy="who-title">
      <SectionHead id="who-title" eyebrow={t("uc.shared.who.eyebrow")} title={t("uc.shared.who.title")} />
      <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-4 lg:gap-6" data-who>
        {items.map((it) => (
          <li key={it.id} className="flex flex-col rounded-lg bg-surface p-4 shadow-card md:p-6 dark:ring-1 dark:ring-line">
            <span className="grid size-10 place-items-center rounded-pill bg-surface-sunken">
              <it.Icon aria-hidden className="size-5 text-ink" strokeWidth={2} />
            </span>
            <h3 className="mt-4 font-display text-heading text-ink">{t(`uc.shared.who.${it.id}.title`)}</h3>
            <p className="mt-2 text-body-sm text-ink-muted">{t(`uc.shared.who.${it.id}.body`)}</p>
            {"link" in it ? (
              <Link
                href={it.link.href}
                prefetch={false}
                className="mt-auto inline-flex min-h-11 items-center gap-1.5 pt-2 text-label text-link underline-offset-4 hover:underline"
              >
                {it.link.label}
                <ArrowRight aria-hidden className="size-4" strokeWidth={2} />
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </Section>
  )
}

function Rules() {
  return (
    <Section id="rules" labelledBy="rules-title">
      <SectionHead id="rules-title" eyebrow={t("uc.shared.rules.eyebrow")} title={t("uc.shared.rules.title")} intro={t("uc.shared.rules.intro")} />
      <RulesFit
        items={[
          {
            id: "house",
            Icon: ShoppingBasket,
            title: t("uc.shared.rules.house.title"),
            rule: t("uc.shared.rules.house.rule", { instant: HOUSE.instant, perPerson: HOUSE.perPerson }),
            body: t("uc.shared.rules.house.body"),
          },
          {
            id: "club",
            Icon: Users,
            title: t("uc.shared.rules.club.title"),
            rule: t("uc.shared.rules.club.rule"),
            body: t("uc.shared.rules.club.body"),
          },
          {
            id: "trust",
            Icon: Sprout,
            title: t("uc.shared.rules.trust.title"),
            rule: t("uc.shared.rules.trust.rule", { step: TRUST.step, instant: INSTANT, max: TRUST.max }),
            body: t("uc.shared.rules.trust.body"),
          },
        ]}
      />
    </Section>
  )
}
