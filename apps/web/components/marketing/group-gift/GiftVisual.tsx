// /group-gift's hero picture: the Project Thirty Pot on a phone, with the money from outside in its activity (Ruth and
// Theo paid in by link, without joining) and the moment that matters breaking out of it: Ben's one OK sending Ana
// the $260 she paid for the gift. Every number is the worked example's (lib/marketing/group-gift.ts): six friends put
// in $40 each, $60 came in from outside, the gift went out, so $40.00 is in the Pot.
// One image (role="img" + uc.gift.hero.visual_label); everything inside is aria-hidden + inert. No buttons, so the
// hero's [Start a Pot] stays the page's one marigold. Static: no motion (the H1 is the LCP; nothing here moves).
//  - phones: a phone cropped by the stage's bottom edge (it fades into `ground`), the OK card over its top-right.
//  - lg: the full phone, the card off its bottom-left, toward the copy; the receipt as a sticker.
import { Check, ChevronLeft, Link } from "lucide-react"
import { FloatCard } from "@/components/landing/home/FloatCard"
import { PhoneFrame } from "@/components/landing/home/PhoneFrame"
import { Sticker } from "@/components/landing/home/Sticker"
import { MoneyText } from "@/components/money/MoneyText"
import { Avatar, AvatarStack } from "@/components/pot/Avatar"
import { CoverTile } from "@/components/pot/CoverTile"
import { t } from "@/i18n/t"
import { cn } from "@/lib/client/cn"
import { formatUsd } from "@/lib/client/money"
import { EXAMPLE_EXTRAS } from "@/lib/marketing/example-math"
import { GIFT_CAST, GIFT_EACH, GIFT_OUTSIDE, NORA_GIFT } from "@/lib/marketing/group-gift"
import { GIFT_EMOJI, GIFT_PEOPLE, OUTSIDERS, type GiftMember } from "./cast"

const GIFT = NORA_GIFT.spends.find((s) => s.id === "gift")!
const PEOPLE = GIFT_CAST.map((id) => GIFT_PEOPLE[id])
const whole = (m: bigint) => formatUsd(m, "whole")
const NORA_GIFT_ONE_OK = EXAMPLE_EXTRAS.oneOkCap
/** who gave the one OK: the first friend who isn't the buyer */
export const OK_BY = GIFT_CAST.find((id) => id !== GIFT.by)!

export function GiftVisual() {
  const label = t("uc.gift.hero.visual_label", { outside: whole(NORA_GIFT.outside), gift: whole(GIFT.amount) })
  return (
    <div
      role="img"
      aria-label={label}
      data-uc-visual
      className="relative -mx-4 h-[26rem] overflow-clip max-xs:h-[24rem] md:-mx-6 md:h-[30rem] lg:mx-0 lg:h-auto lg:overflow-visible lg:py-4"
    >
      <div aria-hidden inert className="relative mx-auto w-[16.5rem] pt-6 max-xs:w-60 md:w-72 lg:pt-0">
        <Sticker
          name="receipt"
          width={64}
          sizes="(min-width: 1024px) 112px, 64px"
          priority
          rotate={-8}
          className="absolute top-0 -left-12 z-0 w-16 max-xs:-left-8 max-xs:w-14 lg:-top-6 lg:-left-20 lg:w-28"
        />
        <PhoneFrame label={label} className="relative z-10 aspect-[390/814] w-full lg:aspect-[390/844]">
          <PotScreen />
        </PhoneFrame>

        <FloatCard
          tilt={-2}
          className="absolute top-[6rem] -right-8 z-20 w-60 max-xs:top-[5.25rem] max-xs:-right-2 max-xs:w-[14.25rem] md:-right-16 lg:top-[78%] lg:right-auto lg:-left-28 lg:w-64 xl:-left-36 dark:ring-1 dark:ring-line"
        >
          <OkCard />
        </FloatCard>
      </div>
      {/* the crop: the phone sinks into the page instead of ending on a hard line */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 h-10 bg-linear-to-b from-transparent to-ground to-60% lg:hidden" />
    </div>
  )
}

/** The Pot screen, about 375 logical px wide (PhoneFrame zooms it): header, balance, today's activity. */
function PotScreen() {
  const ana = GIFT_PEOPLE.ana
  return (
    <div className="absolute inset-0 flex flex-col bg-surface-sunken pt-[var(--phone-safe-top,0px)] font-sans text-ink dark:bg-ground">
      <header className="flex h-14 shrink-0 items-center gap-2 pr-3 pl-1">
        <ChevronLeft className="size-7 shrink-0" strokeWidth={2} />
        <CoverTile emoji={GIFT_EMOJI} cover={5} size="md" className="size-[2.375rem] rounded-md text-[1.1875rem]" />
        <div className="ml-0.5 min-w-0 flex-1">
          <p className="truncate text-body leading-5 font-bold">{t("uc.gift.pot")}</p>
          <p className="truncate text-[0.8125rem] leading-[1.0625rem] text-ink-muted">{t("members.header", { n: PEOPLE.length })}</p>
        </div>
      </header>

      {/* phones: the OK card floats over this empty strip (it never half-covers the balance); lg: the balance */}
      <div aria-hidden className="h-40 shrink-0 lg:hidden" />
      <div className="mx-3 hidden rounded-lg bg-surface p-4 shadow-card lg:block">
        <p className="text-body-sm text-ink-muted">{t("pot.hero.label")}</p>
        <MoneyText micro={GIFT.leftAfter} variant="hero" className="mt-1 block text-ink" />
        <div className="mt-3 flex items-center gap-2">
          <AvatarStack people={PEOPLE} max={6} size="sm" ring="surface" />
          <span className="text-body-sm text-ink-muted tabular-nums">
            {t("pot.each.done", { done: PEOPLE.length, n: PEOPLE.length, each: whole(GIFT_EACH) })}
          </span>
        </div>
      </div>

      <p className="flex justify-center lg:mt-4">
        <span className="rounded-pill bg-surface px-2.5 py-0.5 text-xs font-semibold text-ink-muted">{t("feed.day.today")}</span>
      </p>
      <ul className="mx-3 mt-3 flex flex-col gap-2">
        <Row
          person={ana}
          title={t("feed.approved", { amount: whole(GIFT.amount), name: ana.name, reason: t("uc.gift.reason.gift") })}
          sub={t("feed.approved.ok", { name: GIFT_PEOPLE[OK_BY].name })}
          amount={GIFT.amount}
          sign="out"
        />
        {[...GIFT_OUTSIDE].reverse().map((g) => {
          const who = OUTSIDERS[g.id]
          return <Row key={g.id} person={who} title={t("feed.payin", { name: who.name, amount: whole(g.amount) })} sub={who.who} amount={g.amount} sign="in" link />
        })}
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
  link,
}: {
  person: GiftMember
  title: string
  sub: string
  amount: bigint
  sign: "in" | "out"
  /** money from outside, by link */
  link?: boolean
}) {
  return (
    <li className="flex items-start gap-3 rounded-md bg-surface px-3 py-3">
      <Avatar person={person} size="sm" className={link ? "ring-1 ring-line-strong" : undefined} />
      <div className="min-w-0 flex-1">
        <p className="text-body-sm leading-5 font-semibold text-ink">{title}</p>
        <p className="mt-0.5 flex items-start gap-1 text-[0.8125rem] leading-[1.0625rem] text-ink-muted">
          {link ? <Link className="mt-px size-3.5 shrink-0" strokeWidth={2} /> : null}
          <span className="min-w-0">{sub}</span>
        </p>
      </div>
      <MoneyText micro={amount} sign={sign} variant="row" className={cn("text-[0.9375rem]", sign === "in" ? "text-approved" : "text-ink")} />
    </li>
  )
}

/** The breakout: one OK from another friend paid Ana back for the gift. */
function OkCard() {
  const ana = GIFT_PEOPLE.ana
  const ok = GIFT_PEOPLE[OK_BY]
  return (
    <>
      <div className="flex items-center gap-2 rounded-md bg-surface-sunken py-2 pr-2.5 pl-2 dark:bg-ground">
        <span className="grid size-6 shrink-0 place-items-center rounded-pill bg-surface">
          <Check className="size-4 text-approved" strokeWidth={2} />
        </span>
        <span className="min-w-0 text-label text-ink">{t("feed.approved.ok", { name: ok.name })}</span>
      </div>
      <div className="mt-2.5 flex items-baseline gap-2 px-1">
        <Avatar person={ana} size="xs" className="self-center" />
        <span className="min-w-0 flex-1 overflow-x-clip text-body-sm text-ellipsis whitespace-nowrap text-ink">{t("uc.gift.visual.item")}</span>
        <MoneyText micro={GIFT.amount} sign="out" variant="row" className="text-ink" />
      </div>
      <p className="mt-0.5 px-1 text-body-sm text-ink-muted max-xs:hidden">{t("uc.gift.visual.rule", { oneOk: whole(NORA_GIFT_ONE_OK) })}</p>
    </>
  )
}
