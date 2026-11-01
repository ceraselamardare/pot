// How it works (#how; plan/design-direction/03-landing.md §3): the whole loop in five beats. Each step is a short
// title, one sentence and a live fragment built from the app's own components with the D-61 numbers, so a judge
// gets the product from the fragments alone and an AI judge reads them as text:
//   1. the Trip rules as sentences · 2. Maya's invite in the chat, Leo is in, $450 of $450 collected ·
//   3. $84 approved by Pot rules → $366.00 · 4. $300 needs 2 of 3 approvals, 1 of 2 so far, Leo's push → $66.00 ·
//   5. the refund table, $150.00 in → $22.00 back each.
// Phones: five stacked cards in an <ol>. lg: a 2-2-1 bento (setup pair, then instant beside group, the page's key
// contrast, then close at full width); the paired cards share rows through a subgrid, so their panels line up.
// Fragments are `inert` + aria-hidden (a mock never takes focus or speaks; the step's sentence carries it), and
// none has a marigold button. Stickers: one per step with a real object, at most two per section on desktop.
//
// Motion (plan/design-direction/04-landing-motion.md §3): each fragment panel is one [data-sequence] that tells its
// story ONCE, and ends exactly on the server HTML (which is also the no-JS, reduced-motion and "jumped past it"
// frame). It starts at 35 % in view, or on phones and tablets as soon as its top passes 85 % of the screen, and it
// plays faster (up to 2×, only as much as needed) when a quick scroll would carry its last beats off screen
// (motion/sequence.ts). The step card, numeral, title and sentence never move; only the fragment's contents do, with
// the toolkit's effects (motion/, motion-kit.md) and the timings of 04's tables (ms from the story's start, written
// as data-at). Each fragment's FIRST beat is not a sequence item: it is part of the armed "before" frame with the
// panel and the "In the Pot" foot at its starting amount, so a panel never scrolls in as an empty box. No burst
// anywhere here: the burst answers the visitor's own tap in Try the rules. Each step's sticker is a child of its
// panel (positioned against the step card), so it settles on the step's own sequence. At lg the right card of a pair
// that enters in the same frame starts 300 ms after the left one.
import { Check, Clock, UserRound, Users, Zap } from "lucide-react"
import type { HTMLAttributes, ReactNode } from "react"
import { TypingDots } from "@/components/feedback/TypingDots"
import { MoneyText } from "@/components/money/MoneyText"
import { Avatar } from "@/components/pot/Avatar"
import { CoverTile } from "@/components/pot/CoverTile"
import { GoalBar } from "@/components/pot/GoalBar"
import { StatusChip } from "@/components/pot/StatusChip"
import { t, tLines } from "@/i18n/t"
import { cn } from "@/lib/client/cn"
import { dollars, formatUsd, type Micro } from "@/lib/client/money"
import { approvalsNeeded, TRIP_RULES } from "@/lib/client/rules"
import { CHAT_CAST } from "./ChatThread"
import { InviteBubble } from "./InviteBubble"
import { PushCard } from "./PushCard"
import { RollingMoney } from "./motion/RollingMoney"
import { Sequences } from "./motion/Sequences"
import { seqVars } from "./motion/sequence"
import { Section, SectionHead } from "./Section"
import { Sticker } from "./Sticker"
import type { StickerName } from "./stickers"

const { maya: MAYA, sam: SAM, leo: LEO } = CHAT_CAST
const N = 3
const K = approvalsNeeded(N) // 2 of 3
const INSTANT_LIMIT = formatUsd(TRIP_RULES.instantCap, "whole") // "$100"
const MEMBER_LIMIT = formatUsd(TRIP_RULES.memberBudget, "whole") // "$200"
const POT = t("create.name.placeholder") // "Lisbon Trip"

/** Sentences keep whole dollars ("$84 sent to you"); displayed amounts go through MoneyText ("$84.00"). */
const whole = (m: Micro) => formatUsd(m, "whole")

/** Marks the variable part of a rule sentence so it can be set in bold (t() fills it, then we split). The bold part
 *  never breaks inside ("2 of 3" stays together when the sentence wraps). */
const MARK = "\u0001"
const mark = (v: string | number) => `${MARK}${v}${MARK}`

function Emphasis({ text }: { text: string }) {
  return text.split(MARK).map((part, i) =>
    i % 2 ? (
      <strong key={i} className="font-bold whitespace-nowrap text-ink">
        {part}
      </strong>
    ) : (
      part
    ),
  )
}

export function HowItWorks() {
  return (
    <Section id="how" labelledBy="how-title" className="l-story">
      {/* 35 % in view (04's page-wide trigger), and below lg as soon as a panel's top passes 85 % of the screen; a
          bento pair that enters together plays left, then right +300 ms */}
      <Sequences stagger={300} startLine={0.85} />
      <SectionHead id="how-title" eyebrow={t("home.how.eyebrow")} title={t("home.how.title")} />
      <ol className="flex flex-col gap-8 lg:grid lg:grid-cols-2 lg:gap-x-6 lg:gap-y-12">
        {/* the rules card sits in the middle of its panel (the panel takes step 2's height at lg) */}
        <Step n={1} title={t("home.how.create.title")} body={t("home.how.create.body")}>
          <RulesFragment />
        </Step>
        <Step n={2} title={t("home.how.share.title")} body={t("home.how.share.body")}>
          <ShareFragment />
        </Step>
        {/* the key contrast: top-aligned, so "$84.00" faces "$300.00" and both balances sit on the panels' foot */}
        <Step n={3} title={t("home.how.instant.title")} body={t("home.how.instant.body")} sticker="groceries" stickerLg="hidden" align="start">
          <InstantFragment />
        </Step>
        <Step n={4} title={t("home.how.group.title")} body={t("home.how.group.body")} sticker="boat" align="start">
          <GroupFragment />
        </Step>
        <Step
          n={5}
          title={t("home.how.close.title")}
          body={t("home.how.close.body")}
          sticker="suitcase"
          stickerLg="foot"
          wide
        >
          <CloseFragment />
        </Step>
      </ol>
    </Section>
  )
}

// ---------------------------------------------------------------------------------------------------------

/** The sticker's place from lg. The corner keeps 8 px inside the viewport at 1024 (it was clipped by the band's
 *  overflow-x-clip) and reaches out further from xl; at 96 px it ends above the step's sentence, which therefore
 *  keeps its full width (only the title makes room). Step 5's suitcase sits on the card's bottom edge under the
 *  copy, inside the band (it never reaches the "Try the rules" band below). */
const STICKER_LG = {
  corner: "lg:-top-12 lg:-right-2 lg:w-24 xl:-right-6",
  hidden: "lg:hidden",
  foot: "lg:top-auto lg:right-auto lg:-bottom-6 lg:left-16 lg:w-28",
} as const

function Step({
  n,
  title,
  body,
  sticker,
  stickerLg = "corner",
  wide = false,
  align = "center",
  children,
}: {
  n: number
  title: string
  body: string
  sticker?: StickerName
  /** where the sticker sits from lg (STICKER_LG); off the corner, the title takes the room back */
  stickerLg?: keyof typeof STICKER_LG
  /** step 5 at lg: the full row, copy on the left (5 of 12), the fragment on the right (7 of 12) */
  wide?: boolean
  /** "start": top-aligned content that fills the panel (a Balance row then sits at its foot) */
  align?: "center" | "start"
  children: ReactNode
}) {
  // the sticker's turn while it settles goes toward upright, so it presses down INTO its tilt (+8° starts at +2°)
  const tilt = n % 2 ? 8 : -8
  return (
    <li
      data-step={n}
      className={cn(
        "relative flex flex-col gap-4 rounded-lg bg-surface p-4 shadow-card max-xs:px-3 md:p-6",
        wide
          ? "lg:col-span-2 lg:grid lg:grid-cols-12 lg:items-center lg:gap-8"
          : "lg:row-span-2 lg:grid lg:grid-rows-subgrid lg:gap-y-6",
      )}
    >
      <div className={cn(wide && "lg:col-span-5 lg:self-start")}>
        {/* The heading's text is "Step 3: Small spends approve themselves" for screen readers, heading navigation
            and anything that reads the HTML without its tags: the visually hidden "Step 3:" (home.how.step) is
            real text, and the visible numeral is drawn by CSS from data-n, so it never doubles up ("3Step…").
            Only the heading makes room for the sticker in the corner; the sentence below it uses the full width. */}
        <h3
          className={cn(
            "flex items-start gap-3 font-display text-heading text-ink",
            sticker && "pr-14 md:pr-20",
            sticker && stickerLg !== "corner" && "lg:pr-0",
          )}
        >
          <span
            aria-hidden
            data-n={n}
            className="grid size-8 shrink-0 place-items-center rounded-pill bg-surface-sunken text-label tabular-nums before:content-[attr(data-n)]"
          />
          <span className="min-w-0 pt-1 text-balance">
            <span className="sr-only">{t("home.how.step", { n })} </span>
            {title}
          </span>
        </h3>
        <p className={cn("mt-2 text-body-sm text-ink-muted", wide && "lg:max-w-88")}>{body}</p>
      </div>

      {/* The stage: sunken in Day; in Night it drops to `ground`, so the `surface` rows on it read as raised (Night's
          surface-sunken is lighter than surface, which made the rows look like holes). */}
      <div
        inert
        aria-hidden
        data-sequence
        data-how-fragment={n}
        className={cn(
          // below 360 px the stage gives its padding to the content (the refund table needs ~250 px)
          "flex flex-col rounded-md bg-surface-sunken p-4 max-xs:p-2 md:p-6 dark:bg-ground",
          align === "center" ? "justify-center" : "justify-start",
          wide && "lg:col-span-7",
        )}
      >
        <div className={cn("mx-auto flex w-full max-w-104 flex-col gap-2", align === "start" && "flex-1 lg:justify-between")}>{children}</div>

        {sticker ? (
          // the panel isn't positioned, so this sits against the step card's corner; it settles 200 ms into the story.
          // md: 80 px, lifted 48 px, so even the tall groceries bag ends above the sentence
          <span
            data-seq="settle"
            data-at="200"
            data-turn={tilt > 0 ? "-6" : "6"}
            className={cn("absolute -top-7 -right-1 block w-16 md:-top-12 md:-right-2 md:w-20", STICKER_LG[stickerLg])}
          >
            <Sticker name={sticker} width={64} sizes="(min-width: 1024px) 96px, (min-width: 768px) 80px, 64px" rotate={tilt} className="w-full" />
          </span>
        ) : null}
      </div>
    </li>
  )
}

/** A white row on the stage (the app's list-group look). Passes data-* through, so a row can be a sequence item. */
function Row({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cn("flex min-h-12 items-center gap-3 rounded-md bg-surface px-3 py-2.5", className)}>
      {children}
    </div>
  )
}

/** A 28 px round seat for a state icon, as in the app's result capsule. */
function Badge({ sunken, children }: { sunken?: boolean; children: ReactNode }) {
  return <span className={cn("grid size-7 shrink-0 place-items-center rounded-pill", sunken ? "bg-surface-sunken" : "bg-surface")}>{children}</span>
}

/** "In the Pot" at the panel's foot; the amount rolls from the balance before this step's spend. */
function Balance({ from, micro, at }: { from: Micro; micro: Micro; at: number }) {
  return (
    <div className="mt-auto flex items-end justify-between gap-3 px-1 pt-2 lg:mt-0">
      <span className="text-body-sm text-ink-muted">{t("pot.hero.label")}</span>
      <RollingMoney from={from} micro={micro} at={at} variant="title" className="text-ink" />
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Step 1: the Lisbon Trip with Trip rules, the rules as sentences (the Rules tab's look).
// Story (ends 640 ms): the Pot-name card is already there (the armed frame) → "Trip rules" (160) → the three rules,
// 60 ms apart (240/300/360). The bold values don't animate on their own.

function RulesFragment() {
  const rows = [
    { id: "instant", Icon: Zap, text: t("rules.instant", { instantLimit: mark(INSTANT_LIMIT) }) },
    { id: "group", Icon: Users, text: t("rules.threshold", { k: `${MARK}${K}`, n: `${N}${MARK}` }) },
    { id: "person", Icon: UserRound, text: t("rules.budget", { memberBudget: mark(MEMBER_LIMIT) }) },
  ]
  return (
    <div className="rounded-md bg-surface p-3">
      <p className="px-1 text-body-sm text-ink-muted">{t("create.name.label")}</p>
      <div className="mt-1.5 flex items-center gap-3 rounded-sm bg-surface-sunken p-2">
        <CoverTile emoji="🇵🇹" cover={0} size="md" />
        <p className="min-w-0 flex-1 truncate font-display text-heading text-ink">{POT}</p>
      </div>
      <p data-seq="fade" data-at="160" className="mt-4 px-1 text-label text-ink">
        {t("rules.preset.trip")}
      </p>
      <ul className="mt-1 flex flex-col">
        {rows.map(({ id, Icon, text }, i) => (
          <li key={id} data-seq="fade-up" data-at={240 + i * 60} className="flex gap-3 border-t border-line py-3 last:pb-1">
            <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-ink" strokeWidth={2} />
            <p className="min-w-0 text-body text-ink tabular-nums">
              <Emphasis text={text} />
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Step 2: Maya's invite in the chat, Leo joins and adds $150, $450 of $450 collected.
// Story (ends 1.38 s): Maya's invite is already there (the armed frame) → Leo's card (520) → his avatar pops (600) →
// "+ $150.00" (760) → the goal bar fills from $300 to $450 (clip-path, never width) while its sentence rolls
// "$300 of $450 collected" → "$450 of $450 collected" in step (880, 500).

function ShareFragment() {
  return (
    <>
      <div className="flex items-end gap-1.5">
        <Avatar person={MAYA} size="sm" className="size-7 text-[0.6875rem]" />
        <InviteBubble className="max-w-[16rem]" />
      </div>
      <div data-seq="fade-up" data-at="520" className="mt-1 rounded-md bg-surface p-3">
        <div className="flex items-start gap-3">
          <span data-seq="pop" data-at="600" data-scale=".6" className="grid shrink-0">
            <Avatar person={LEO} size="sm" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-baseline justify-between gap-3">
              <span className="text-label text-ink">{t("setup.success.title")}</span>
              <span data-seq="fade" data-at="760">
                <MoneyText micro={dollars(150)} sign="in" className="text-approved" />
              </span>
            </p>
            <p className="text-body-sm text-ink-muted tabular-nums">{t("feed.contribution", { name: LEO.name, amount: whole(dollars(150)) })}</p>
          </div>
        </div>
        <div data-seq="goal" data-at="880" style={seqVars({ from: "66.7%" })} className="mt-3">
          <div data-seq="roll" data-at="880" data-roll-from={String(dollars(300))} data-roll-to={String(dollars(450))} data-roll-format="whole">
            <GoalBar collected={dollars(450)} goal={dollars(450)} />
          </div>
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Step 3: $84 for groceries, approved by Pot rules, sent; the Pot holds $366.00.
// Story (ends 2.46 s): Groceries $84.00 and In the Pot $450.00 are already there (the armed frame) → "Checking Pot
// rules…" (200) with ONE dot cycle (280, 1200) that rests on the still look → "Approved by Pot rules" (1480,
// brand-soft from its first frame) and its check pops (1560) → "$84 sent to you" (1760) + the Sent chip (1840) →
// In the Pot $450.00 → $366.00 (1960, 500).
// The checking row stays as a log line. No burst: nobody tapped.

function InstantFragment() {
  return (
    <>
      <Row>
        <Avatar person={MAYA} size="sm" />
        <span className="min-w-0 flex-1 text-body text-ink">{t("spend.reason.chip.groceries")}</span>
        <MoneyText micro={dollars(84)} className="text-ink" />
      </Row>
      <Row data-seq="fade-up" data-at="200">
        <Badge sunken>
          <span data-seq="dots" data-at="280" className="grid place-items-center">
            <TypingDots still size="sm" className="text-ink-muted" />
          </span>
        </Badge>
        <span className="text-label text-ink-muted">{t("spend.checking")}</span>
      </Row>
      <div data-seq="fade-up" data-at="1480" data-scale=".98" className="flex min-h-16 items-center gap-3 rounded-md bg-brand-soft px-3 py-3">
        <Badge>
          <span data-seq="pop" data-at="1560" className="grid place-items-center">
            <Check aria-hidden className="size-5 text-approved" strokeWidth={2} />
          </span>
        </Badge>
        <div className="min-w-0">
          <p className="text-label text-ink">{t("spend.approved")}</p>
          <p className="text-body-sm text-ink-muted tabular-nums">{t("feed.instant.rule", { instantLimit: INSTANT_LIMIT })}</p>
        </div>
      </div>
      <Row data-seq="fade-up" data-at="1760" className="justify-between">
        <span className="text-body text-ink tabular-nums">{t("spend.sent", { amount: whole(dollars(84)) })}</span>
        <span data-seq="fade" data-at="1840" className="flex shrink-0">
          <StatusChip status="sent" />
        </span>
      </Row>
      <Balance from={dollars(450)} micro={dollars(366)} at={1960} />
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Step 4: $300 for the boat trip needs 2 of 3 approvals; Maya's own counts (1 of 2); Leo's push; on its way → $66.00.
// Story (ends 2.46 s): Maya's request and In the Pot $366.00 are already there (the armed frame) → "This needs 2 of 3
// approvals" (280) → the "1 of 2 approvals" chip pops (640) + "Maya · asked, approval counted" (720) → Leo's push
// drops in like a banner (1120, 12 px, 360) → "Approved! $300 is on its way to Maya." (1720) and its check pops
// (1800) → In the Pot $366.00 → $66.00 (1960; one digit fewer, so the roll runs on a ghost that keeps the final
// width). The chip stays "1 of 2": a log reading.

function GroupFragment() {
  const [needs, why] = tLines("preview.vote.over_cap", { k: K, n: N, instantLimit: INSTANT_LIMIT })
  return (
    <>
      <div className="rounded-md bg-surface p-3">
        <div className="flex items-start gap-3">
          <Avatar person={MAYA} size="sm" />
          <p className="min-w-0 flex-1 pt-1 text-body leading-5 text-ink tabular-nums">
            {t("feed.pending", { name: MAYA.name, amount: whole(dollars(300)), reason: t("home.chat.push.reason") })}
          </p>
          <MoneyText micro={dollars(300)} className="pt-0.5 text-ink" />
        </div>
        <div data-seq="fade" data-at="280" className="mt-3 flex items-start gap-3 border-t border-line pt-3">
          <Badge sunken>
            <Clock aria-hidden className="size-4 text-waiting" strokeWidth={2} />
          </Badge>
          <div className="min-w-0">
            <p className="text-label text-ink tabular-nums">{needs}</p>
            <p className="text-body-sm text-ink-muted tabular-nums">{why}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span data-seq="pop" data-at="640" data-scale=".6" className="flex shrink-0">
            <StatusChip status="needs">{t("approve.progress", { count: 1, k: K })}</StatusChip>
          </span>
          <span data-seq="fade" data-at="720" className="text-body-sm text-ink-muted">
            {t("approve.timeline.asked", { name: MAYA.name })}
          </span>
        </div>
      </div>
      <div data-seq="drop" data-at="1120" data-y="12" data-dur="360">
        <PushCard className="max-w-none" />
      </div>
      <Row data-seq="fade-up" data-at="1720">
        <Badge sunken>
          <span data-seq="pop" data-at="1800" className="grid place-items-center">
            <Check aria-hidden className="size-4 text-approved" strokeWidth={2} />
          </span>
        </Badge>
        <span className="min-w-0 text-label text-pretty text-ink tabular-nums">{t("approve.final", { amount: whole(dollars(300)), name: MAYA.name })}</span>
      </Row>
      <Balance from={dollars(366)} micro={dollars(66)} at={1960} />
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Step 5: the Pot closes; Maya, Sam and Leo each put in $150.00 and get back $22.00.
// Story (ends 1.26 s): the caption and column heads are already there (the armed frame) → Maya, Sam, Leo land 60 ms
// apart (120/180/240) → the total row (300) and its "Gets back" rolls $0.00 → $66.00 (300, 500, ghost width;
// "Put in" stays still: only the money coming back moves) → "Everyone got their share back." (840) → the "Pot
// closed" chip pops (900). No burst: closing isn't a rules approval.

const REFUNDS = [MAYA, SAM, LEO].map((p) => ({ person: p, putIn: dollars(150), back: dollars(22) }))

function CloseFragment() {
  return (
    <div className="rounded-md bg-surface p-3 max-xs:px-1">
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-1 pb-3 xs:px-0">
        <CoverTile emoji="🇵🇹" cover={0} size="sm" />
        <p className="min-w-28 flex-1 truncate font-display text-heading text-ink">{POT}</p>
        <span data-seq="pop" data-at="900" data-scale=".6" className="flex shrink-0">
          <StatusChip status="approved">{t("close.done.title")}</StatusChip>
        </span>
      </div>
      <CloseTable />
      <p data-seq="fade" data-at="840" className="mt-2 border-t border-line px-2 pt-3 text-body-sm text-ink-muted">
        {t("feed.closed.sub")}
      </p>
    </div>
  )
}

/**
 * The app's RefundTable (components/pot/RefundTable.tsx), same markup, classes and copy, rebuilt here for one
 * reason: its rows and its total must be sequence items (a row lands, the total rolls inside a RollingMoney), and
 * RefundTable passes neither attributes nor a slot through (components/pot is frozen for the landing work). Two
 * deliberate differences: the rules sit on the cells of a `border-separate` table instead of on collapsed rows,
 * because a collapsed border is painted by the table and would neither move nor fade with its row; and there is no
 * "You" row (the mock has no viewer). Keep the two visually identical.
 */
function CloseTable() {
  const totalIn = REFUNDS.reduce((s, r) => s + r.putIn, 0n)
  const totalBack = REFUNDS.reduce((s, r) => s + r.back, 0n)
  const rule = "[&>*]:border-t [&>*]:border-line"
  return (
    <table className="w-full table-fixed border-separate border-spacing-0 text-left">
      <caption className="pb-1 pl-2 text-left text-label text-ink">
        {t("close.table.caption")}
      </caption>
      <colgroup>
        <col />
        <col className="w-[5.75rem]" />
        <col className="w-[5.75rem]" />
      </colgroup>
      <thead>
        <tr className="text-body-sm text-ink-muted">
          <th scope="col" className="py-2 pl-2 font-normal">
            {t("close.table.person")}
          </th>
          <th scope="col" className="py-2 text-right font-normal">
            {t("close.table.put_in")}
          </th>
          <th scope="col" className="py-2 pr-2 text-right font-normal">
            {t("close.table.gets_back")}
          </th>
        </tr>
      </thead>
      <tbody>
        {REFUNDS.map((r, i) => (
          <tr key={r.person.id} data-seq="fade-up" data-at={120 + i * 60} className={rule}>
            <th scope="row" className="py-2.5 pl-2 font-normal">
              <span className="flex min-w-0 items-center gap-2">
                <Avatar person={r.person} size="xs" className="max-[359px]:hidden" />
                <span className="min-w-0 truncate text-body text-ink">{r.person.name}</span>
              </span>
            </th>
            <td className="py-2.5 text-right">
              <MoneyText micro={r.putIn} className="text-ink-muted" />
            </td>
            <td className="py-2.5 pr-2 text-right">
              <MoneyText micro={r.back} className="text-ink" />
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr data-seq="fade" data-at="300" className="[&>*]:border-t-2 [&>*]:border-line-strong">
          <th scope="row" className="py-2.5 pl-2 text-label font-semibold text-ink">
            {t("close.table.total")}
          </th>
          <td className="py-2.5 text-right">
            <MoneyText micro={totalIn} className="text-ink-muted" />
          </td>
          <td className="py-2.5 pr-2 text-right">
            <RollingMoney from={0n} micro={totalBack} at={300} className="text-ink" />
          </td>
        </tr>
      </tfoot>
    </table>
  )
}
