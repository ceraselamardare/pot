// /bachelorette-party's hero picture: the Lake House Weekend Pot on a phone, the moment the group approved the house,
// with the approval tally ("Approved by 5 of 8", eight seats, five filled) breaking out of it. The trip page shows
// Pot rules approving a small spend on their own; this one shows the group deciding a big one. Every number is the
// worked example's (lib/marketing/bachelorette-party.ts): eight friends put in $250 each, the house went through
// with 5 of 8, then Bea's $60 of decorations went through on their own, so $740.00 is in the Pot.
// One image (role="img" + uc.party.hero.visual_label); everything inside is aria-hidden + inert. No buttons, so the
// hero's [Start a Pot] stays the page's one marigold. Static: no motion (the H1 is the LCP; nothing here moves).
//  - phones: a phone cropped by the stage's bottom edge (it fades into `ground`), the tally card over its top-right.
//  - lg: the full phone, the card off its bottom-left, toward the copy; sunglasses and tickets as stickers.
import { Check, ChevronLeft } from "lucide-react"
import { FloatCard } from "@/components/landing/home/FloatCard"
import { PhoneFrame } from "@/components/landing/home/PhoneFrame"
import { Sticker } from "@/components/landing/home/Sticker"
import { MoneyText } from "@/components/money/MoneyText"
import { Avatar, AvatarStack } from "@/components/pot/Avatar"
import { CoverTile } from "@/components/pot/CoverTile"
import { t } from "@/i18n/t"
import { cn } from "@/lib/client/cn"
import { formatUsd } from "@/lib/client/money"
import { EXAMPLE_RULES } from "@/lib/marketing/example-math"
import { LAKE_HOUSE, PARTY_CAST, PARTY_EACH, type PartySpendId } from "@/lib/marketing/bachelorette-party"
import { PARTY_EMOJI, PARTY_PEOPLE, type PartyMember } from "./cast"

const spend = (id: PartySpendId) => LAKE_HOUSE.spends.find((s) => s.id === id)!
const HOUSE = spend("house")
const DECORATIONS = spend("decorations")
const PEOPLE = PARTY_CAST.map((id) => PARTY_PEOPLE[id])
/** the first k friends approved the house (Chloe asked, so hers counts) */
const APPROVERS = PEOPLE.slice(0, HOUSE.k)
const whole = (m: bigint) => formatUsd(m, "whole")
const list = new Intl.ListFormat("en-GB", { type: "conjunction" })

export function LakeHouseVisual() {
  const label = t("uc.party.hero.visual_label", { k: HOUSE.k, n: HOUSE.n, amount: whole(HOUSE.amount), left: formatUsd(DECORATIONS.leftAfter) })
  return (
    <div
      role="img"
      aria-label={label}
      data-uc-visual
      className="relative -mx-4 h-[26rem] overflow-clip max-xs:h-[24rem] md:-mx-6 md:h-[30rem] lg:mx-0 lg:h-auto lg:overflow-visible lg:py-4"
    >
      <div aria-hidden inert className="relative mx-auto w-[16.5rem] pt-6 max-xs:w-60 md:w-72 lg:pt-0">
        <Sticker
          name="sunglasses"
          width={80}
          sizes="(min-width: 1024px) 144px, 80px"
          priority
          rotate={-10}
          className="absolute top-2 -left-16 z-0 w-20 max-xs:-left-10 max-xs:w-16 lg:-top-4 lg:-left-28 lg:w-36"
        />
        <PhoneFrame label={label} className="relative z-10 aspect-[390/814] w-full lg:aspect-[390/844]">
          <PotScreen />
        </PhoneFrame>

        <FloatCard
          tilt={-2}
          className="absolute top-[6rem] -right-8 z-20 w-60 max-xs:top-[5.25rem] max-xs:-right-2 max-xs:w-[14.25rem] md:-right-16 lg:top-[78%] lg:right-auto lg:-left-28 lg:w-64 xl:-left-36 dark:ring-1 dark:ring-line"
        >
          <TallyCard />
        </FloatCard>

        <Sticker
          name="tickets"
          width={64}
          sizes="(min-width: 1024px) 112px, 64px"
          priority
          rotate={10}
          className="absolute -right-16 bottom-24 z-20 hidden w-28 lg:block"
        />
      </div>
      {/* the crop: the phone sinks into the page instead of ending on a hard line */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 h-10 bg-linear-to-b from-transparent to-ground to-60% lg:hidden" />
    </div>
  )
}

/** The Pot screen, about 375 logical px wide (PhoneFrame zooms it): header, balance, today's activity. */
function PotScreen() {
  const { chloe, bea, zoe } = PARTY_PEOPLE
  return (
    <div className="absolute inset-0 flex flex-col bg-surface-sunken pt-[var(--phone-safe-top,0px)] font-sans text-ink dark:bg-ground">
      <header className="flex h-14 shrink-0 items-center gap-2 pr-3 pl-1">
        <ChevronLeft className="size-7 shrink-0" strokeWidth={2} />
        <CoverTile emoji={PARTY_EMOJI} cover={4} size="md" className="size-[2.375rem] rounded-md text-[1.1875rem]" />
        <div className="ml-0.5 min-w-0 flex-1">
          <p className="truncate text-body leading-5 font-bold">{t("uc.party.pot")}</p>
          <p className="truncate text-[0.8125rem] leading-[1.0625rem] text-ink-muted">{t("members.header", { n: PEOPLE.length })}</p>
        </div>
      </header>

      {/* phones: the tally card floats over this empty strip (it never half-covers the balance); lg: the balance */}
      <div aria-hidden className="h-40 shrink-0 lg:hidden" />
      <div className="mx-3 hidden rounded-lg bg-surface p-4 shadow-card lg:block">
        <p className="text-body-sm text-ink-muted">{t("pot.hero.label")}</p>
        <MoneyText micro={DECORATIONS.leftAfter} variant="hero" className="mt-1 block text-ink" />
        <div className="mt-3 flex items-center gap-2">
          <AvatarStack people={PEOPLE} max={5} size="sm" ring="surface" />
          <span className="text-body-sm text-ink-muted tabular-nums">
            {t("pot.each.done", { done: PEOPLE.length, n: PEOPLE.length, each: whole(PARTY_EACH) })}
          </span>
        </div>
      </div>

      <p className="flex justify-center lg:mt-4">
        <span className="rounded-pill bg-surface px-2.5 py-0.5 text-xs font-semibold text-ink-muted">{t("feed.day.today")}</span>
      </p>
      <ul className="mx-3 mt-3 flex flex-col gap-2">
        <Row
          person={bea}
          title={t("feed.instant", { name: bea.name, amount: whole(DECORATIONS.amount), reason: t("uc.party.reason.decorations") })}
          sub={t("feed.instant.rule", { instantLimit: whole(EXAMPLE_RULES.instantCap) })}
          amount={DECORATIONS.amount}
          sign="out"
          tone="rules"
        />
        <Row
          person={chloe}
          title={t("feed.approved", { amount: whole(HOUSE.amount), name: chloe.name, reason: t("uc.party.reason.house") })}
          sub={t("feed.approved.sub", { names: list.format(APPROVERS.map((p) => p.name)) })}
          amount={HOUSE.amount}
          sign="out"
        />
        <Row person={zoe} title={t("feed.contribution", { name: zoe.name, amount: whole(PARTY_EACH) })} sub={t("uc.party.pot")} amount={PARTY_EACH} sign="in" />
      </ul>
    </div>
  )
}

function Row({
  person,
  title,
  sub,
  amount,
  sign,
  tone,
}: {
  person: PartyMember
  title: string
  sub: string
  amount: bigint
  sign: "in" | "out"
  tone?: "rules"
}) {
  return (
    <li className={cn("flex items-start gap-3 rounded-md px-3 py-3", tone === "rules" ? "bg-brand-soft" : "bg-surface")}>
      <Avatar person={person} size="sm" ring={tone === "rules" ? "brand-soft" : undefined} />
      <div className="min-w-0 flex-1">
        <p className="text-body-sm leading-5 font-semibold text-ink">{title}</p>
        <p className="mt-0.5 flex items-start gap-1 text-[0.8125rem] leading-[1.0625rem] text-ink-muted">
          {tone === "rules" ? <Check className="mt-px size-3.5 shrink-0 text-approved" strokeWidth={2} /> : null}
          <span className="min-w-0">{sub}</span>
        </p>
      </div>
      <MoneyText micro={amount} sign={sign} variant="row" className={cn("text-[0.9375rem]", sign === "in" ? "text-approved" : "text-ink")} />
    </li>
  )
}

/** The breakout: the group's decision on the house, as a tally (eight seats, the five approvals that carried it). */
function TallyCard() {
  return (
    <>
      <div className="flex items-baseline gap-2 px-1">
        <span className="min-w-0 flex-1 truncate text-label text-ink">{t("uc.party.reason.house")}</span>
        <MoneyText micro={HOUSE.amount} variant="row" className="text-ink" />
      </div>
      <div className="mt-2.5 flex gap-1 px-1" data-tally>
        {PEOPLE.map((p, i) => (
          <span key={p.id} className={cn("h-2 flex-1 rounded-pill", i < HOUSE.k ? "bg-approved" : "bg-surface-sunken dark:bg-line")} />
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 px-1">
        <AvatarStack people={APPROVERS} max={3} size="xs" ring="surface" />
        <span className="flex min-w-0 items-center gap-1 text-body-sm font-semibold whitespace-nowrap text-ink tabular-nums">
          <Check className="size-4 shrink-0 text-approved" strokeWidth={2} />
          {t("uc.party.visual.tally", { k: HOUSE.k, n: HOUSE.n })}
        </span>
      </div>
    </>
  )
}
