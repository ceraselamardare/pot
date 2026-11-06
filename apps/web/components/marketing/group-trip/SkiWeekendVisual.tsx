// /group-trip's hero picture: the Ski Weekend Pot on a phone, right after Sam's groceries, with the "Approved by Pot
// rules" card breaking out of it. Every number is the worked example's (lib/marketing/group-trip.ts): six friends
// put in $300 each, the cabin went through with 4 of 6, then Sam's $84 of groceries went through on its own, so
// $516.00 is in the Pot. Built from the landing mock kit (PhoneFrame, FloatCard, Sticker) and the app's own parts.
// One image (role="img" + uc.trip.hero.visual_label); everything inside is aria-hidden + inert. No buttons, so the
// hero's [Start a Pot] stays the page's one marigold. Static: no motion (the H1 is the LCP; nothing here moves).
//  - phones: a phone cropped by the stage's bottom edge (it fades into `ground`), the card over its top-right.
//  - lg: the full phone, the card off its bottom-left, toward the copy; a suitcase and the groceries as stickers.
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
import { SKI_CAST, SKI_EACH, SKI_RULES, SKI_WEEKEND } from "@/lib/marketing/group-trip"
import { SKI_PEOPLE } from "./cast"

export const SKI_EMOJI = "🎿"

const spend = (id: "cabin" | "groceries" | "lift") => SKI_WEEKEND.spends.find((s) => s.id === id)!
const CABIN = spend("cabin")
const GROCERIES = spend("groceries")
const PEOPLE = SKI_CAST.map((id) => SKI_PEOPLE[id])
const whole = (m: bigint) => formatUsd(m, "whole")
const list = new Intl.ListFormat("en-GB", { type: "conjunction" })

export function SkiWeekendVisual() {
  const label = t("uc.trip.hero.visual_label", { amount: whole(GROCERIES.amount), left: formatUsd(GROCERIES.leftAfter) })
  return (
    <div
      role="img"
      aria-label={label}
      data-uc-visual
      className="relative -mx-4 h-[26rem] overflow-clip max-xs:h-[24rem] md:-mx-6 md:h-[30rem] lg:mx-0 lg:h-auto lg:overflow-visible lg:py-4"
    >
      <div aria-hidden inert className="relative mx-auto w-[16.5rem] pt-6 max-xs:w-60 md:w-72 lg:pt-0">
        <Sticker
          name="suitcase"
          width={80}
          sizes="(min-width: 1024px) 128px, 80px"
          priority
          rotate={-8}
          className="absolute -top-2 -left-14 z-0 w-20 max-xs:-left-9 max-xs:w-16 lg:-top-6 lg:-left-24 lg:w-32"
        />
        <PhoneFrame label={label} className="relative z-10 aspect-[390/814] w-full lg:aspect-[390/844]">
          <PotScreen />
        </PhoneFrame>

        <FloatCard
          tilt={-2}
          className="absolute top-[6rem] -right-8 z-20 w-60 max-xs:top-[5.25rem] max-xs:-right-2 max-xs:w-[14.25rem] md:-right-16 lg:top-[80%] lg:right-auto lg:-left-28 lg:w-64 xl:-left-36 dark:ring-1 dark:ring-line"
        >
          <ApprovedCard />
        </FloatCard>

        <Sticker
          name="groceries"
          width={64}
          sizes="(min-width: 1024px) 112px, 64px"
          priority
          rotate={8}
          className="absolute -right-16 bottom-16 z-20 hidden w-28 lg:block"
        />
      </div>
      {/* the crop: the phone sinks into the page instead of ending on a hard line */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 h-10 bg-linear-to-b from-transparent to-ground to-60% lg:hidden" />
    </div>
  )
}

/** The Pot screen, about 375 logical px wide (PhoneFrame zooms it): header, balance, today's activity. */
function PotScreen() {
  const potName = t("uc.trip.pot")
  const maya = SKI_PEOPLE.maya
  const sam = SKI_PEOPLE.sam
  const ines = SKI_PEOPLE.ines
  const approvers = PEOPLE.slice(0, CABIN.k).map((p) => p.name)
  return (
    <div className="absolute inset-0 flex flex-col bg-surface-sunken pt-[var(--phone-safe-top,0px)] font-sans text-ink dark:bg-ground">
      <header className="flex h-14 shrink-0 items-center gap-2 pr-3 pl-1">
        <ChevronLeft className="size-7 shrink-0" strokeWidth={2} />
        <CoverTile emoji={SKI_EMOJI} cover={1} size="md" className="size-[2.375rem] rounded-md text-[1.1875rem]" />
        <div className="ml-0.5 min-w-0 flex-1">
          <p className="truncate text-body leading-5 font-bold">{potName}</p>
          <p className="truncate text-[0.8125rem] leading-[1.0625rem] text-ink-muted">{t("members.header", { n: PEOPLE.length })}</p>
        </div>
      </header>

      {/* phones: the breakout card floats over this empty strip instead (it never half-covers the balance); lg: the
          balance, with the card off the phone's bottom-left */}
      <div aria-hidden className="h-40 shrink-0 lg:hidden" />
      <div className="mx-3 hidden rounded-lg bg-surface p-4 shadow-card lg:block">
        <p className="text-body-sm text-ink-muted">{t("pot.hero.label")}</p>
        <MoneyText micro={GROCERIES.leftAfter} variant="hero" className="mt-1 block text-ink" />
        <div className="mt-3 flex items-center gap-2">
          <AvatarStack people={PEOPLE} max={6} size="sm" ring="surface" />
          <span className="text-body-sm text-ink-muted tabular-nums">
            {t("pot.each.done", { done: PEOPLE.length, n: PEOPLE.length, each: whole(SKI_EACH) })}
          </span>
        </div>
      </div>

      <p className="flex justify-center lg:mt-4">
        <span className="rounded-pill bg-surface px-2.5 py-0.5 text-xs font-semibold text-ink-muted">{t("feed.day.today")}</span>
      </p>
      <ul className="mx-3 mt-3 flex flex-col gap-2">
        <Row
          person={sam}
          title={t("feed.instant", { name: sam.name, amount: whole(GROCERIES.amount), reason: t("spend.reason.chip.groceries") })}
          sub={t("spend.approved")}
          amount={GROCERIES.amount}
          sign="out"
          tone="rules"
        />
        <Row
          person={maya}
          title={t("feed.approved", { amount: whole(CABIN.amount), name: maya.name, reason: t("uc.trip.reason.cabin") })}
          sub={t("feed.approved.sub", { names: list.format(approvers) })}
          amount={CABIN.amount}
          sign="out"
        />
        <Row
          person={ines}
          title={t("feed.contribution", { name: ines.name, amount: whole(SKI_EACH) })}
          sub={t("uc.trip.pot")}
          amount={SKI_EACH}
          sign="in"
        />
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
  person: (typeof SKI_PEOPLE)[keyof typeof SKI_PEOPLE]
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

/** The breakout: Pot rules approved Sam's groceries on their own (the brand-soft "the rules did this" highlight). */
function ApprovedCard() {
  const sam = SKI_PEOPLE.sam
  return (
    <>
      <div className="flex items-center gap-2 rounded-md bg-brand-soft py-2 pr-2.5 pl-2">
        <span className="grid size-6 shrink-0 place-items-center rounded-pill bg-surface">
          <Check className="size-4 text-approved" strokeWidth={2} />
        </span>
        <span className="text-label text-ink">{t("spend.approved")}</span>
      </div>
      <div className="mt-2.5 flex items-baseline gap-2 px-1">
        <Avatar person={sam} size="xs" className="self-center" />
        <span className="min-w-0 flex-1 overflow-x-clip text-body-sm text-ellipsis whitespace-nowrap text-ink">{t("spend.reason.chip.groceries")}</span>
        <MoneyText micro={GROCERIES.amount} sign="out" variant="row" className="text-ink" />
      </div>
      <p className="mt-0.5 px-1 text-body-sm text-ink-muted max-xs:hidden">{t("feed.instant.rule", { instantLimit: whole(SKI_RULES.instantCap) })}</p>
    </>
  )
}
