// /shared-account-with-friends' hero picture: The Crew's Pot on a phone, with its rules in view (the point of the
// page: a shared account whose rules everyone can read), and Jo's lake-house request breaking out of it as a card
// that says it needs the group ("Needs 3 approvals · 1 so far"): nobody can take it all alone. Every number is the
// worked example's (lib/marketing/shared-account.ts): $800 in, then Kit's $45 of snacks went through on their own
// and Ama's $250 of tickets with Dev's OK, so $505.00 is in the Pot when Jo asks for $420.
// One image (role="img" + uc.shared.hero.visual_label); everything inside is aria-hidden + inert. No buttons, so the
// hero's [Start a Pot] stays the page's one marigold. Static: no motion (the H1 is the LCP).
//  - phones: the phone cropped by the stage's bottom edge, the request card under the rules (over today's rows).
//  - lg: the full phone, the card off its bottom-left (under today's rows); concert tickets as a sticker top-left.
import { ChevronLeft, Clock, Hand, ShoppingBasket, Users } from "lucide-react"
import { FloatCard } from "@/components/landing/home/FloatCard"
import { PhoneFrame } from "@/components/landing/home/PhoneFrame"
import { Sticker } from "@/components/landing/home/Sticker"
import { MoneyText } from "@/components/money/MoneyText"
import { Avatar, AvatarStack } from "@/components/pot/Avatar"
import { CoverTile } from "@/components/pot/CoverTile"
import { t } from "@/i18n/t"
import { cn } from "@/lib/client/cn"
import { formatUsd } from "@/lib/client/money"
import { CREW_CAST, CREW_EXTRAS, CREW_RULES, THE_CREW } from "@/lib/marketing/shared-account"
import { CREW_PEOPLE } from "./cast"

export const CREW_EMOJI = "🌻"

const whole = (m: bigint) => formatUsd(m, "whole")
const spend = (id: "snacks" | "tickets" | "house") => THE_CREW.spends.find((s) => s.id === id)!
const SNACKS = spend("snacks")
const TICKETS = spend("tickets")
const HOUSE = spend("house")
const PEOPLE = CREW_CAST.map((id) => CREW_PEOPLE[id])

export function CrewVisual() {
  const label = t("uc.shared.hero.visual_label", { left: formatUsd(TICKETS.leftAfter), amount: whole(HOUSE.amount), k: HOUSE.k, n: HOUSE.n })
  return (
    <div
      role="img"
      aria-label={label}
      data-uc-visual
      className="relative -mx-4 h-[30rem] overflow-clip max-xs:h-[27.5rem] md:-mx-6 md:h-[34rem] lg:mx-0 lg:h-auto lg:overflow-visible lg:py-4"
    >
      <div aria-hidden inert className="relative mx-auto w-[16.5rem] pt-6 max-xs:w-60 md:w-72 lg:pt-0">
        <Sticker
          name="tickets"
          width={80}
          sizes="(min-width: 1024px) 128px, 80px"
          priority
          rotate={-10}
          className="absolute -top-1 -left-14 z-0 w-20 max-xs:-left-9 max-xs:w-16 lg:-top-6 lg:-left-24 lg:w-32"
        />
        <PhoneFrame label={label} className="relative z-10 aspect-[390/814] w-full lg:aspect-[390/844]">
          <PotScreen />
        </PhoneFrame>

        <FloatCard
          tilt={2}
          className="absolute top-[19.25rem] -left-10 z-20 w-[15.5rem] max-xs:top-[17.5rem] max-xs:-left-3 max-xs:w-[14.25rem] md:top-[21rem] md:-left-20 lg:top-[72%] lg:right-auto lg:-left-32 lg:w-64 dark:ring-1 dark:ring-line"
        >
          <RequestCard />
        </FloatCard>
      </div>
      {/* the crop: the phone sinks into the page instead of ending on a hard line */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 h-10 bg-linear-to-b from-transparent to-ground to-60% lg:hidden" />
    </div>
  )
}

/** The Pot screen, about 375 logical px wide (PhoneFrame zooms it): header, balance, the rules, today. */
function PotScreen() {
  const potName = t("uc.shared.pot")
  const kit = CREW_PEOPLE.kit
  const ama = CREW_PEOPLE.ama
  return (
    <div className="absolute inset-0 flex flex-col bg-surface-sunken pt-[var(--phone-safe-top,0px)] font-sans text-ink dark:bg-ground">
      <header className="flex h-14 shrink-0 items-center gap-2 pr-3 pl-1">
        <ChevronLeft className="size-7 shrink-0" strokeWidth={2} />
        <CoverTile emoji={CREW_EMOJI} cover={4} size="md" className="size-[2.375rem] rounded-md text-[1.1875rem]" />
        <div className="ml-0.5 min-w-0 flex-1">
          <p className="truncate text-body leading-5 font-bold">{potName}</p>
          <p className="truncate text-[0.8125rem] leading-[1.0625rem] text-ink-muted">{t("members.header", { n: PEOPLE.length })}</p>
        </div>
      </header>

      <div className="mx-3 rounded-lg bg-surface p-4 shadow-card">
        <p className="text-body-sm text-ink-muted">{t("pot.hero.label")}</p>
        <MoneyText micro={TICKETS.leftAfter} variant="hero" className="mt-1 block text-ink" />
        <div className="mt-3">
          <AvatarStack people={PEOPLE} max={5} size="sm" ring="surface" />
        </div>
      </div>

      <div className="mx-3 mt-3 rounded-lg bg-surface p-4">
        <p className="text-label text-ink">{t("rules.label")}</p>
        <ul className="mt-2 flex flex-col gap-2 text-body-sm text-ink">
          <RuleLine Icon={ShoppingBasket}>{t("rules.instant", { instantLimit: whole(CREW_RULES.instantCap) })}</RuleLine>
          <RuleLine Icon={Hand}>{t("uc.shared.visual.rule.one_ok", { oneOk: whole(CREW_EXTRAS.oneOkCap) })}</RuleLine>
          <RuleLine Icon={Users}>{t("rules.threshold", { k: HOUSE.k, n: HOUSE.n })}</RuleLine>
        </ul>
      </div>

      <p className="mt-4 flex justify-center">
        <span className="rounded-pill bg-surface px-2.5 py-0.5 text-xs font-semibold text-ink-muted">{t("feed.day.today")}</span>
      </p>
      <ul className="mx-3 mt-3 flex flex-col gap-2">
        <Row
          person={ama}
          title={t("feed.approved", { amount: whole(TICKETS.amount), name: ama.name, reason: t("uc.shared.reason.tickets") })}
          sub={t("feed.approved.ok", { name: CREW_PEOPLE.dev.name })}
          amount={TICKETS.amount}
        />
        <Row
          person={kit}
          title={t("feed.instant", { name: kit.name, amount: whole(SNACKS.amount), reason: t("uc.shared.reason.snacks") })}
          sub={t("spend.approved")}
          amount={SNACKS.amount}
        />
      </ul>
    </div>
  )
}

function RuleLine({ Icon, children }: { Icon: typeof Hand; children: string }) {
  return (
    <li className="flex items-start gap-2">
      <Icon className="mt-0.5 size-4 shrink-0 text-ink-muted" strokeWidth={2} />
      <span className="min-w-0">{children}</span>
    </li>
  )
}

function Row({ person, title, sub, amount }: { person: (typeof CREW_PEOPLE)[keyof typeof CREW_PEOPLE]; title: string; sub: string; amount: bigint }) {
  return (
    <li className="flex items-start gap-3 rounded-md bg-surface px-3 py-3">
      <Avatar person={person} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="text-body-sm leading-5 font-semibold text-ink">{title}</p>
        <p className="mt-0.5 text-[0.8125rem] leading-[1.0625rem] text-ink-muted">{sub}</p>
      </div>
      <MoneyText micro={amount} sign="out" variant="row" className="text-[0.9375rem] text-ink" />
    </li>
  )
}

/** The breakout: Jo asks for the lake house, and it waits for the group (waiting blue, a clock and the words). */
function RequestCard() {
  const jo = CREW_PEOPLE.jo
  return (
    <>
      <div className="flex items-start gap-2.5 px-1">
        <Avatar person={jo} size="sm" />
        <p className="min-w-0 flex-1 text-body-sm font-semibold text-ink">
          {t("feed.pending", { name: jo.name, amount: whole(HOUSE.amount), reason: t("uc.shared.reason.house") })}
        </p>
      </div>
      <div className={cn("mt-2.5 flex items-center gap-2 rounded-md bg-surface-sunken px-2.5 py-2 dark:bg-ground")} data-status="waiting">
        <Clock className="size-4 shrink-0 text-waiting" strokeWidth={2} />
        <span className="text-body-sm whitespace-nowrap text-ink tabular-nums">{t("feed.pending.sub", { k: HOUSE.k, count: 1 })}</span>
      </div>
    </>
  )
}
