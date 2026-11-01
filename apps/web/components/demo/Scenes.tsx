"use client"
// The phone's screens in the /demo explainer (05 §8.2 AppScene), composed from the app's own components with the
// story's numbers. Only the app's own copy keys (create.*, spend.*, approve.*, close.*, add.*, landing.*, setup.*,
// pot.*, feed.*), so the phone stays jargon-free by construction (a unit test renders every beat and checks).
// The sheets themselves are wired to machines and data hooks, so they are never mounted: each scene rebuilds its
// sheet from their presentational parts (RulePreview, ApprovalTimeline, RefundTable, ClosedMoment, GoalBar,
// MoneyText, Celebration…). Where a part isn't exported (the Spend result card, the hero), the copy here keeps the
// same markup and classes (the CloseTable precedent, notes/landing.md).
//
// The one actionable control is the scene's own primary ([Create Pot], [Get $84 back], [Approve $300]…): marigold,
// and the same as Next. Everything else is shown but inert (no focus, no clicks). A beat that repeats the previous
// beat's screen is the moment right after that tap: the screen shows its busy state instead of the button. On a
// screen with no next tap (the last beat), the primary is drawn secondary and inert: no marigold is visible. A result
// screen's [Done] and the share sheet's [Share link] take `active` too (the /demo tour's steps 2, 7, 9 and 11 make
// them live: a person taps them to go on).
import { ArrowUpRight, Check, Clock, Plane, Plus, ShieldCheck, Users, Gift, X } from "lucide-react"
import { createContext, useContext, type ReactNode } from "react"
import { Celebration } from "@/components/money/Celebration"
import { AmountDisplay } from "@/components/money/Keypad"
import { MoneyText } from "@/components/money/MoneyText"
import { ProgressSteps } from "@/components/feedback/States"
import { TypingDots } from "@/components/feedback/TypingDots"
import { LockupOnBrand } from "@/components/brand/LockupOnBrand"
import { PushCard } from "@/components/landing/home/PushCard"
import { LiveMoney } from "@/components/landing/home/motion/LiveMoney"
import { ApprovalTimeline } from "@/components/pot/ApprovalTimeline"
import { Avatar, AvatarStack, avatarTint } from "@/components/pot/Avatar"
import { Chip, Segmented } from "@/components/pot/Controls"
import { CoverTile } from "@/components/pot/CoverTile"
import { GoalBar } from "@/components/pot/GoalBar"
import { RefundTable } from "@/components/pot/RefundTable"
import { StatusChip } from "@/components/pot/StatusChip"
import { ClosedMoment } from "@/components/sheets/CloseSheet"
import { RulePreview } from "@/components/sheets/RulePreview"
import { Button } from "@/components/ui/button"
import { t, tLines } from "@/i18n/t"
import { cn } from "@/lib/client/cn"
import { PEOPLE } from "@/lib/client/mock/fixtures"
import type { PersonVM } from "@/lib/client/mock/types"
import { formatUsd, type Micro } from "@/lib/client/money"
import { previewSpend, TRIP_RULES } from "@/lib/client/rules"
import type { AppScene, Category, Persona } from "@/app/demo/_data/types"

/** What every scene can read: the story's numbers at this chapter, decided on the server from the dataset. */
export interface PhoneStory {
  potName: string
  emoji: string
  /** dollars in the Pot before and after this chapter's money moves (micro) */
  potBefore: string
  potAfter: string
  /** goal = $150 × members */
  goal: string
  /** members before and after (personas in join order) */
  membersBefore: Persona[]
  membersAfter: Persona[]
  /** per person: put in, spent without asking (before this chapter; micro) */
  ledger: Record<Persona, { contributed: string; instantUsed: string }>
  /** the request a spend / approve scene is about */
  request: { amount: string; category: Category; requester: Persona } | null
  /** what closing pays each member (micro), in join order */
  refunds: { persona: Persona; putIn: string; back: string }[]
  /** "Nov 14" for the share sheet's expiry line */
  expiry: string
}

export interface SceneProps {
  scene: AppScene
  story: PhoneStory
  you: Persona
  people: Record<Persona, PersonVM>
  /** this beat repeats the previous screen: the tap has happened */
  tapped: boolean
  /** the primary is the next step */
  active: boolean
  onPrimary: () => void
  /** the burst's key (0 = none) */
  burst: number
}

const micro = (s: string): Micro => BigInt(s)
const whole = (m: Micro) => formatUsd(m, "whole")

// ---------------------------------------------------------------------------------------------------------
// Chrome

/** The id of a hint the live primary is described by ("Pressing it is the same as Next.", the /demo tour). */
export const PrimaryHint = createContext<string | undefined>(undefined)

/** The scene's primary: marigold and actionable when it is the next step; otherwise secondary and inert. */
function Primary({ active, onPrimary, children, busy }: { active: boolean; onPrimary: () => void; children: ReactNode; busy?: boolean }) {
  const hint = useContext(PrimaryHint)
  if (active)
    return (
      // the phone is drawn at about 0.5-0.8 scale: a taller invisible hit area keeps the tap target ≥ 44 px on screen
      <Button variant="primary" className="relative w-full before:absolute before:inset-x-0 before:-inset-y-5 before:content-['']" onClick={onPrimary} aria-describedby={hint} data-phone-primary>
        {children}
      </Button>
    )
  return (
    <div inert>
      <Button className="min-h-13 w-full" aria-busy={busy || undefined}>
        {busy ? <TypingDots size="sm" /> : null}
        {children}
      </Button>
    </div>
  )
}

/** Inert app controls (chips, segmented control, secondary buttons): shown, never focused. */
function Inert({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div inert className={className}>
      {children}
    </div>
  )
}

/** The Pot screen behind a sheet: header + hero, under the scrim. Decorative (the sheet says what matters). */
function PotPeek({ story, members, balance }: { story: PhoneStory; members: PersonVM[]; balance: Micro }) {
  return (
    <div aria-hidden className="absolute inset-0 px-4 pt-(--phone-safe-top)">
      <div className="flex items-center gap-2 pt-3 pb-4">
        <CoverTile emoji={story.emoji} cover={0} size="sm" />
        <p className="min-w-0 flex-1 truncate font-display text-title text-ink">{story.potName}</p>
        <AvatarStack people={members} size="sm" />
      </div>
      <div className="rounded-lg bg-surface p-4 shadow-card">
        <p className="text-body-sm text-ink-muted">{t("pot.hero.label")}</p>
        <MoneyText micro={balance} variant="hero" className="text-ink" />
      </div>
    </div>
  )
}

/** A bottom sheet as the app draws it (components/sheets/Sheet.tsx): grabber, heading + ✕, body, footer. */
function PhoneSheet({
  title,
  titleClassName,
  header,
  children,
  footer,
  peek,
  full,
}: {
  title: string
  titleClassName?: string
  header?: ReactNode
  children: ReactNode
  footer?: ReactNode
  peek: ReactNode
  /** full height, like the Create sheet */
  full?: boolean
}) {
  return (
    <div className="absolute inset-0 flex flex-col">
      {peek}
      <div aria-hidden className="absolute inset-0 bg-(--pot-scrim)" />
      <div className={cn("relative mt-auto flex max-h-[calc(100%-var(--phone-safe-top)-1rem)] flex-col rounded-t-lg bg-surface text-ink shadow-sheet", full && "h-[calc(100%-var(--phone-safe-top)-1rem)]")}>
        <div aria-hidden className="mx-auto mt-2 h-1.25 w-10 shrink-0 rounded-pill bg-line-strong/60" />
        <div className="flex shrink-0 items-start gap-2 px-4 pt-2">
          <div className="min-w-0 flex-1 pt-2">
            {header ?? <h3 className={cn("font-display text-heading text-balance text-ink", titleClassName)}>{title}</h3>}
          </div>
          <span aria-hidden className="-mr-2 grid size-11 shrink-0 place-items-center rounded-pill text-ink">
            <X className="size-6" strokeWidth={2} />
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden px-4 pb-4">{children}</div>
        {footer ? <div className="shrink-0 border-t border-line bg-surface px-4 pt-3 pb-[calc(12px+var(--phone-safe-bottom))]">{footer}</div> : null}
      </div>
    </div>
  )
}

/** "In the Pot $366.00": the one number that rolls (500 ms) when money moves. */
function InThePot({ balance }: { balance: Micro }) {
  return (
    <div className="flex items-end justify-between gap-3 border-t border-line px-1 pt-3" data-phone-balance>
      <span className="text-body-sm text-ink-muted">{t("pot.hero.label")}</span>
      <LiveMoney micro={balance} ghost="end" variant="title" className="text-ink" />
    </div>
  )
}

function people(list: Persona[], all: Record<Persona, PersonVM>) {
  return list.map((p) => all[p])
}

// ---------------------------------------------------------------------------------------------------------

export function Scene(props: SceneProps) {
  const s = props.scene
  switch (s.scene) {
    case "create":
      return s.step === 1 ? <CreateName {...props} /> : s.step === 2 ? <CreateRules {...props} /> : <Share {...props} />
    case "invite_landing":
      return <InviteLanding {...props} />
    case "youre_in":
      return <YoureIn {...props} />
    case "add_money":
      return s.phase === "form" ? <AddMoney {...props} /> : <PotHome {...props} adding={s.phase === "adding"} />
    case "pot":
      return <PotHome {...props} adding={false} />
    case "spend":
      return s.phase === "form" ? <SpendForm {...props} amount={micro(s.amount)} category={s.category} /> : <SpendResult {...props} amount={micro(s.amount)} category={s.category} phase={s.phase} />
    case "push":
      return <Push {...props} text={s.text} />
    case "approve":
      return <Approve {...props} done={s.phase === "done"} />
    case "close":
      return <Close {...props} phase={s.phase} />
  }
}

// ---------------------------------------------------------------------------------------------------------
// Chapter 1: create

const EMOJI = ["🇵🇹", "🏖️", "⛺", "🎉", "🍕", "⚽"] as const

function CreateName({ story, people: all, you, active, onPrimary }: SceneProps) {
  return (
    <PhoneSheet
      full
      title={t("create.step1.title")}
      peek={<div aria-hidden className="absolute inset-0 bg-ground" />}
      footer={
        <Primary active={active} onPrimary={onPrimary}>
          {t("create.cta.next")}
        </Primary>
      }
    >
      <div className="flex flex-col gap-4 pt-1">
        <p className="text-body-sm text-ink-muted">{t("create.step_of", { step: 1, total: 2 })}</p>
        <figure className="flex flex-col gap-2">
          <div className="flex items-center gap-3 rounded-lg bg-surface p-3 shadow-card ring-1 ring-line">
            <CoverTile emoji={story.emoji} cover={0} size="lg" />
            <div className="min-w-0">
              <p className="truncate font-display text-heading text-ink">{story.potName}</p>
              <p className="text-body-sm text-ink-muted">{t("create.preview.members")}</p>
            </div>
            <Avatar person={all[you]} size="sm" className="ml-auto" />
          </div>
          <figcaption className="text-body-sm text-ink-muted">{t("create.preview_hint")}</figcaption>
        </figure>
        <div className="flex flex-col gap-1.5">
          <p className="flex items-center justify-between text-label text-ink">
            {t("create.name.label")}
            <span className="text-body-sm font-normal text-ink-muted tabular-nums">{t("create.name.count", { count: story.potName.length })}</span>
          </p>
          <p className="flex h-13 items-center rounded-sm border border-line-strong bg-surface-sunken px-3 text-body text-ink">{story.potName}</p>
        </div>
        <div>
          <p className="mb-2 text-label text-ink">{t("create.cover")}</p>
          <Inert className="grid grid-cols-6 gap-2">
            {EMOJI.map((e) => (
              <span
                key={e}
                aria-hidden
                className={cn("grid aspect-square min-h-11 place-items-center rounded-md text-2xl", e === story.emoji ? "bg-brand-soft ring-2 ring-ink" : "bg-surface-sunken")}
              >
                {e}
              </span>
            ))}
          </Inert>
        </div>
      </div>
    </PhoneSheet>
  )
}

function CreateRules({ story, tapped, active, onPrimary }: SceneProps) {
  const [trip, ...lines] = t("create.preset.trip").split(" · ")
  if (tapped) {
    const [creating, free] = t("create.progress", { potName: story.potName }).split(" · ")
    return (
      <PhoneSheet full title={creating!} peek={<div aria-hidden className="absolute inset-0 bg-ground" />}>
        <div className="flex flex-col gap-6 pt-4" aria-busy="true" data-phone-busy>
          <div className="flex items-center gap-3">
            <CoverTile emoji={story.emoji} cover={0} size="lg" />
            <p className="font-display text-heading text-ink">{story.potName}</p>
          </div>
          <ProgressSteps
            steps={[
              { label: creating!, helper: free, state: "current" },
              { label: t("create.progress.ready"), state: "next" },
            ]}
          />
        </div>
      </PhoneSheet>
    )
  }
  return (
    <PhoneSheet
      full
      title={t("create.step2.title")}
      peek={<div aria-hidden className="absolute inset-0 bg-ground" />}
      footer={
        <div className="flex flex-col gap-2">
          <Primary active={active} onPrimary={onPrimary}>
            {t("create.cta")}
          </Primary>
          <Inert>
            <Button variant="ghost" className="w-full">
              {t("create.back")}
            </Button>
          </Inert>
        </div>
      }
    >
      <div className="flex flex-col gap-3 pt-1">
        <p className="text-body-sm text-ink-muted">{t("create.step_of", { step: 2, total: 2 })}</p>
        <div className="relative rounded-lg border-2 border-ink bg-brand-soft p-4">
          <span aria-hidden className="absolute top-3 right-3 grid size-6 place-items-center rounded-pill bg-ink text-surface">
            <Check className="size-4" strokeWidth={3} />
          </span>
          <p className="flex items-center gap-2 font-display text-heading text-ink">
            <Plane aria-hidden className="size-5" strokeWidth={2} />
            {trip}
          </p>
          <ul className="mt-2 flex flex-col gap-1 text-body text-ink">
            {lines.map((line) => (
              <li key={line} className="flex items-start gap-2">
                <Check aria-hidden className="mt-1 size-4 shrink-0" strokeWidth={2.5} />
                {line.charAt(0).toUpperCase() + line.slice(1)}
              </li>
            ))}
          </ul>
        </div>
        {(["create.preset.club", "create.preset.team"] as const).map((k) => (
          <div key={k} className="flex items-center justify-between rounded-lg bg-surface-sunken p-3">
            <p className="flex items-center gap-2 font-display text-heading text-ink-muted">
              {k === "create.preset.club" ? <Users aria-hidden className="size-5" strokeWidth={2} /> : <Gift aria-hidden className="size-5" strokeWidth={2} />}
              {t(k).split(" · ")[0]}
            </p>
            <span className="rounded-pill bg-surface px-2.5 py-0.5 text-body-sm font-semibold text-ink-muted">{t("create.preset.soon")}</span>
          </div>
        ))}
        <div className="flex items-center justify-between gap-3 rounded-md border border-line p-3">
          <span className="flex flex-col">
            <span className="text-label text-ink">{t("create.goal.label")}</span>
            <span className="text-body-sm text-ink-muted tabular-nums">{t("create.goal.each", { amount: whole(micro(story.goal) / 3n) })}</span>
          </span>
          <span aria-hidden className="relative h-7 w-12 shrink-0 rounded-pill bg-ink">
            <span className="absolute top-0.5 left-0.5 size-6 translate-x-5 rounded-pill bg-surface shadow" />
          </span>
        </div>
      </div>
    </PhoneSheet>
  )
}

/** The share sheet's chat preview (components/landing/home/InviteBubble.tsx, same markup and classes), with the seats
 *  and "n friends are in" of THIS moment: on the share sheet only Maya is in (the landing's bubble shows Maya + Sam). */
function ShareBubble({ inSoFar, potName }: { inSoFar: PersonVM[]; potName: string }) {
  return (
    <div data-invite-bubble aria-hidden className="w-[17rem] max-w-[17rem] rounded-[1.125rem] rounded-bl-md bg-surface p-1 font-sans text-ink [--og-u:calc((17rem_-_0.5rem)/100)]">
      <p className="mx-2 mt-[3px] mb-1 text-[0.8125rem] leading-[1.0625rem] font-bold text-ink-muted">{PEOPLE.maya.name}</p>
      <div className="overflow-hidden rounded-[0.875rem] bg-surface-sunken">
        <div className="@container relative flex aspect-[1200/630] flex-col items-center bg-brand text-on-brand">
          <CoverTile
            emoji="🇵🇹"
            cover={0}
            size="md"
            className="mt-[calc(4.3*var(--og-u,1cqw))] size-[calc(23.3*var(--og-u,1cqw))] rounded-[calc(5.2*var(--og-u,1cqw))] text-[length:calc(12.5*var(--og-u,1cqw))]"
          />
          <p className="mt-[calc(1.8*var(--og-u,1cqw))] max-w-[75%] truncate font-display text-[length:calc(5.6*var(--og-u,1cqw))] leading-[1.08] font-extrabold">{potName}</p>
          <div className="absolute inset-x-[calc(4*var(--og-u,1cqw))] bottom-[calc(3.4*var(--og-u,1cqw))] flex items-center justify-between gap-[calc(2*var(--og-u,1cqw))]">
            <LockupOnBrand className="text-[length:var(--og-u,1cqw)]" />
            <span className="flex items-center gap-[calc(1.6*var(--og-u,1cqw))]">
              <span className="flex">
                {inSoFar.map((p, i) => (
                  <span
                    key={p.id}
                    className={cn("size-[calc(5.6*var(--og-u,1cqw))] rounded-pill ring-[length:calc(0.4*var(--og-u,1cqw))] ring-brand", avatarTint(p.joinIndex), i > 0 && "-ml-[calc(1.2*var(--og-u,1cqw))]")}
                  />
                ))}
              </span>
              <span className="text-[length:calc(3.2*var(--og-u,1cqw))] leading-none font-semibold whitespace-nowrap">{t("og.members", { n: inSoFar.length })}</span>
            </span>
          </div>
        </div>
        <div className="px-2.5 pt-2 pb-2.5">
          <p className="text-[0.9375rem] leading-5 font-bold">{t("landing.title", { inviter: PEOPLE.maya.name, potName })}</p>
          <p className="mt-0.5 text-[0.8125rem] leading-[1.125rem] text-ink-muted">{t("landing.trust")}</p>
        </div>
      </div>
      <p className="px-2 pt-1.5 pb-1 text-body leading-[1.3125rem]">{t("home.chat.msg.invite")}</p>
    </div>
  )
}

function Share({ story, people: all, you, active, onPrimary }: SceneProps) {
  // the secret after # never reaches a server: shown masked, as on a real phone
  const link = `pot.app/j/${story.potName.toLowerCase().replace(/ /g, "-")}-7k2f?i=…#•••••`
  return (
    <PhoneSheet
      title={t("share.title", { potName: story.potName })}
      peek={<PotPeek story={story} members={[all[you]]} balance={0n} />}
      footer={
        <div className="flex flex-col gap-2">
          <Primary active={active} onPrimary={onPrimary}>
            {t("share.cta.share")}
          </Primary>
          <Inert>
            <Button className="w-full">{t("share.cta.copy")}</Button>
          </Inert>
        </div>
      }
    >
      <div className="flex flex-col gap-3 pt-1">
        <p className="text-body-sm text-ink-muted">{t("share.preview_hint")}</p>
        <div className="rounded-md bg-surface-sunken p-3">
          <ShareBubble inSoFar={[all[you]]} potName={story.potName} />
        </div>
        <p className="text-body-sm text-ink tabular-nums">{t("share.expiry", { date: story.expiry, usesLeft: 10 })}</p>
        <div className="flex flex-col gap-1">
          <p className="text-label text-ink">{t("share.link.label")}</p>
          <p className="truncate rounded-sm bg-surface-sunken px-3 py-2.5 text-body-sm text-ink tabular-nums" data-phone-link>
            {link}
          </p>
        </div>
      </div>
    </PhoneSheet>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Chapter 2: the invite and "You're in!"

function InviteLanding({ story, people: all, you, tapped, active, onPrimary }: SceneProps) {
  const members = people(story.membersBefore, all)
  const balance = micro(story.potBefore)
  if (tapped) {
    return (
      <div className="absolute inset-0 flex flex-col gap-6 bg-ground px-5 pt-[calc(var(--phone-safe-top)+2rem)]" aria-busy="true" data-phone-busy>
        <h3 className="font-display text-title text-ink">{t("setup.greeting", { firstName: all[you].name })}</h3>
        <ProgressSteps
          steps={[
            { label: t("setup.progress.1"), state: "done" },
            { label: t("setup.progress.2", { potName: story.potName }), state: "current" },
            { label: t("setup.progress.3"), state: "next" },
          ]}
        />
        <p className="text-body-sm text-ink-muted">{t("setup.time")}</p>
      </div>
    )
  }
  return (
    <div className="absolute inset-0 flex flex-col bg-ground px-4 pt-(--phone-safe-top) pb-(--phone-safe-bottom)">
      <div className="flex flex-col gap-3 pt-2">
        <CoverTile emoji={story.emoji} cover={0} size="banner" className="h-24 text-5xl" />
        <h3 className="text-center font-display text-title text-balance text-ink">{t("landing.title", { inviter: all.maya.name, potName: story.potName })}</h3>
        <div className="flex flex-col items-center gap-1.5">
          <div aria-hidden className="flex items-center">
            {members.map((m, i) => (
              <Avatar key={m.id} person={m} size="sm" ring="ground" className={i > 0 ? "-ml-2" : undefined} />
            ))}
            <span className="-ml-2 size-8 rounded-pill border-[1.5px] border-dashed border-line-strong bg-ground" />
          </div>
          <p className="text-body-sm text-ink-muted">{t("landing.members", { names: t("feed.and", { a: members[0]!.name, b: members[1]!.name }) })}</p>
        </div>
        <div className="rounded-lg bg-surface p-4 shadow-card">
          <p className="text-body-sm text-ink-muted">{t("pot.hero.label")}</p>
          <MoneyText micro={balance} variant="hero" className="text-ink" />
          <GoalBar collected={balance} goal={micro(story.goal)} className="mt-3" />
          <p className="mt-1 text-body-sm text-ink">{t("landing.share", { suggested: whole(micro(story.goal) / 3n) })}</p>
        </div>
        <div className="flex items-start gap-3 rounded-md bg-surface-sunken p-3">
          <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-ink" strokeWidth={2} />
          <p className="text-body-sm text-ink">{t("landing.trust")}</p>
        </div>
      </div>
      <div className="mt-auto flex flex-col gap-2 pt-3">
        <p className="text-center text-body-sm text-ink-muted">{t("landing.signed_in_as", { email: PEOPLE.leo.emailHint })}</p>
        <Primary active={active} onPrimary={onPrimary}>
          {t("landing.signed_in_as.cta", { potName: story.potName })}
        </Primary>
      </div>
    </div>
  )
}

function YoureIn({ story, people: all, active, onPrimary }: SceneProps) {
  const each = whole(micro(story.goal) / 3n)
  return (
    <PhoneSheet
      title={t("setup.success.title")}
      titleClassName="text-balance-hero"
      peek={<PotPeek story={story} members={people(story.membersAfter, all)} balance={micro(story.potAfter)} />}
      footer={
        <div className="flex flex-col gap-2">
          <Primary active={active} onPrimary={onPrimary}>
            {t("setup.success.cta", { suggested: each })}
          </Primary>
          <Inert>
            <Button variant="ghost" className="w-full">
              {t("setup.success.later")}
            </Button>
          </Inert>
        </div>
      }
    >
      <div className="flex flex-col gap-4 pt-2" data-phone-done>
        <p className="text-body text-ink">{t("setup.success.body", { potName: story.potName, suggested: each })}</p>
        <div aria-hidden className="flex items-center">
          {people(story.membersAfter, all).map((m, i) => (
            <Avatar key={m.id} person={m} size="md" ring="surface" className={i > 0 ? "-ml-2" : undefined} />
          ))}
        </div>
      </div>
    </PhoneSheet>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Chapter 3: add money, the Pot

function AddMoney({ story, people: all, you, active, onPrimary }: SceneProps) {
  const each = micro(story.goal) / 3n
  const after = micro(story.potBefore) + each
  return (
    <PhoneSheet
      title={t("add.title", { potName: story.potName })}
      peek={<PotPeek story={story} members={people(story.membersBefore, all)} balance={micro(story.potBefore)} />}
      footer={
        <Primary active={active} onPrimary={onPrimary}>
          {t("add.cta", { amount: whole(each) })}
        </Primary>
      }
    >
      <div className="flex flex-col gap-4 pt-1">
        <AmountDisplay value={String(each / 1_000_000n)} label={t("add.amount.label")} />
        <Inert className="flex justify-center">
          <Chip selected onClick={() => {}}>
            {t("add.chip.share", { suggested: whole(each) })}
          </Chip>
        </Inert>
        <div>
          <p className="mb-2 text-body-sm text-ink-muted">{t("add.source.label")}</p>
          <div className="flex min-h-14 items-center gap-3 rounded-md border-2 border-ink bg-surface px-3">
            <span aria-hidden className="grid size-5 place-items-center rounded-pill border-2 border-ink">
              <span className="size-2.5 rounded-pill bg-ink" />
            </span>
            <span className="min-w-0 flex-1 text-body text-ink">{t("add.source.demo")}</span>
            <span className="rounded-pill bg-surface-sunken px-2 py-0.5 text-body-sm font-semibold text-ink">{t("add.source.test_pill")}</span>
          </div>
        </div>
        <p className="text-body-sm text-ink tabular-nums" data-phone-outcome>
          {after >= micro(story.goal) ? t("add.after.goal", { potName: story.potName, balance: formatUsd(after) }) : t("add.after", { potName: story.potName, balance: formatUsd(after) })}
        </p>
        <span className="sr-only">{all[you].name}</span>
      </div>
    </PhoneSheet>
  )
}

/** A feed row as the app draws it (components/pot/Feed.tsx Row). */
function FeedRow({ person, text, amount, pending }: { person: PersonVM; text: string; amount: Micro; pending?: boolean }) {
  return (
    <li className="flex w-full list-none items-start gap-3 rounded-md bg-surface p-3">
      <Avatar person={person} size="sm" ring="surface" className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-body text-pretty text-ink">{text}</p>
        {pending ? (
          <div className="mt-2 flex">
            <StatusChip status="sending" />
          </div>
        ) : null}
      </div>
      <div className="shrink-0 pt-0.5 text-right">
        <MoneyText micro={amount} sign="in" className={pending ? "text-ink-muted" : "text-approved"} />
      </div>
    </li>
  )
}

/** The Pot screen (components/pot/PotScreen + BalanceHero): header, hero with the goal bar, today's feed. */
function PotHome({ story, people: all, you, adding }: SceneProps & { adding: boolean }) {
  const members = people(story.membersAfter, all)
  const each = micro(story.goal) / 3n
  const balance = adding ? micro(story.potBefore) : micro(story.potAfter)
  const mine = micro(story.ledger[you].contributed) + (adding ? 0n : each)
  const share = whole(balance / 3n)
  const heroLabel = t("pot.hero.a11y", { balance: formatUsd(balance), share })
  return (
    <div className="absolute inset-0 flex flex-col bg-ground px-4 pt-(--phone-safe-top)">
      <div className="flex items-center gap-2 pt-3 pb-4">
        <CoverTile emoji={story.emoji} cover={0} size="sm" />
        <h3 className="min-w-0 flex-1 truncate font-display text-title text-ink">{story.potName}</h3>
        <AvatarStack people={members} size="sm" />
      </div>
      <section aria-label={heroLabel} className="rounded-lg bg-surface p-4 shadow-card" data-phone-hero>
        <p className="text-body-sm text-ink-muted">{t("pot.hero.label")}</p>
        <p className="mt-1">
          <LiveMoney micro={balance} ghost="start" variant="hero" className="text-ink" />
        </p>
        <p className="mt-1 text-body-sm text-ink-muted">{t("pot.hero.share", { share, contributed: whole(mine) })}</p>
        {adding ? (
          <p className="mt-2 inline-flex items-center gap-1.5 text-body-sm text-ink-muted">
            <Clock aria-hidden className="size-4" strokeWidth={2} />
            {t("pot.hero.pending", { amount: whole(each) })}
          </p>
        ) : null}
        <GoalBar collected={balance} goal={micro(story.goal)} className="mt-4" />
        <Inert className="mt-4 grid grid-cols-2 gap-2">
          <Button className="min-h-13 w-full">
            <Plus aria-hidden strokeWidth={2.25} />
            {t("pot.cta.add")}
          </Button>
          <Button className="min-h-13 w-full">
            <ArrowUpRight aria-hidden strokeWidth={2.25} />
            {t("pot.cta.spend")}
          </Button>
        </Inert>
      </section>
      <p className="mt-5 mb-2 px-1 text-label text-ink">{t("feed.day.today")}</p>
      <ul className="flex flex-col gap-2">
        <FeedRow person={all[you]} text={t("feed.contribution", { name: all[you].name, amount: whole(each) })} amount={each} pending={adding} />
        {story.membersBefore
          .filter((p) => p !== you)
          .map((p) => (
            <FeedRow key={p} person={all[p]} text={t("feed.contribution", { name: all[p].name, amount: whole(micro(story.ledger[p].contributed)) })} amount={micro(story.ledger[p].contributed)} />
          ))}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Chapters 4 and 5: spend

function SpendForm({ story, people: all, you, active, onPrimary, amount, category }: SceneProps & { amount: Micro; category: Category }) {
  const members = story.membersBefore
  const used = micro(story.ledger[you].instantUsed)
  const preview = previewSpend({
    amount,
    balance: micro(story.potBefore),
    rules: TRIP_RULES,
    memberCount: members.length,
    used,
    contributed: micro(story.ledger[you].contributed),
    receiverIsMember: true,
  })
  const cta = preview.path === "vote" ? t("spend.cta.vote") : t("spend.cta.instant", { amount: whole(amount) })
  return (
    <PhoneSheet
      title={t("spend.title", { potName: story.potName })}
      peek={<PotPeek story={story} members={people(members, all)} balance={micro(story.potBefore)} />}
      footer={
        <Primary active={active} onPrimary={onPrimary}>
          {cta}
        </Primary>
      }
    >
      <div className="flex flex-col gap-4 pt-1">
        <Inert>
          <Segmented
            label={t("spend.type.label")}
            value="reimburse"
            onChange={() => {}}
            options={[
              { value: "reimburse", label: t("spend.type.reimburse") },
              { value: "pay_member", label: t("spend.type.pay_member") },
            ]}
          />
        </Inert>
        <AmountDisplay value={String(amount / 1_000_000n)} label={t("spend.amount.label")} />
        <RulePreview preview={preview} pot={{ rules: TRIP_RULES, balance: micro(story.potBefore) }} used={used} />
        <div>
          <p className="mb-2 text-body-sm text-ink-muted">{t("spend.reason.label")}</p>
          <Inert className="flex gap-2 overflow-hidden">
            {[category, ...(["groceries", "food", "tickets", "stay"] as const).filter((c) => c !== category)].map((c) => (
              <Chip key={c} selected={c === category} onClick={() => {}}>
                {t(`spend.reason.chip.${c}`)}
              </Chip>
            ))}
          </Inert>
        </div>
      </div>
    </PhoneSheet>
  )
}

/** The Spend sheet's result card (components/sheets/SpendSheet.tsx ResultCard), same markup and classes. */
function SpendResult({
  story,
  people: all,
  you,
  amount,
  category,
  phase,
  burst,
  active,
  onPrimary,
}: SceneProps & { amount: Micro; category: Category; phase: "checking" | "approved" | "sent" | "sent_to_group" }) {
  const members = people(story.membersBefore, all)
  const k = story.membersBefore.length >= 3 ? 2 : story.membersBefore.length
  const n = story.membersBefore.length
  const vote = phase === "sent_to_group"
  const approvedish = phase === "approved" || phase === "sent"
  const balance = phase === "sent" ? micro(story.potAfter) : micro(story.potBefore)
  // the vote card keeps only "Sent to the group": its "Needs 2 of 3 approvals" beside the "1 of 2 approvals" chip read
  // as two fractions (tour QA F6). The rule (2 of 3) is on the form before it and in the caption; this screen is progress.
  const [voteTitle] = tLines("spend.vote_sent", { k, n })
  return (
    <PhoneSheet
      title={t("spend.title", { potName: story.potName })}
      peek={<PotPeek story={story} members={members} balance={balance} />}
      footer={
        phase === "sent" || vote ? (
          <Primary active={active} onPrimary={onPrimary}>
            {t("spend.done")}
          </Primary>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-5 pt-2" aria-busy={phase === "checking" || undefined} data-spend-result={phase}>
        <div className="flex flex-col items-center gap-1 text-center">
          <MoneyText micro={amount} variant="hero" className="text-ink" />
          <span className="text-body-sm text-ink-muted">{t(`spend.reason.chip.${category}`)}</span>
        </div>
        {vote ? (
          <>
            <div className="flex items-center gap-3 rounded-md bg-surface-sunken p-3">
              <Clock aria-hidden className="size-5 shrink-0 text-waiting" strokeWidth={2.25} />
              <p className="text-label text-ink">{voteTitle}</p>
            </div>
            <StatusChip status="needs" className="self-start">
              {t("approve.progress", { count: 1, k })}
            </StatusChip>
            <ApprovalTimeline
              r={{
                approvals: [all[you]],
                declines: [],
                pending: story.membersBefore.filter((p) => p !== you).map((p) => all[p]),
                requester: all[you],
                k,
              }}
              me={you}
            />
          </>
        ) : (
          <div
            className={cn(
              "relative flex min-h-16 items-center gap-3 rounded-md px-4 py-3 transition-colors duration-200 ease-standard",
              approvedish ? "bg-brand-soft" : "bg-surface-sunken",
            )}
            data-capsule
          >
            <Celebration key={burst} play={burst > 0 && phase === "approved"} />
            {phase === "checking" ? (
              <>
                <TypingDots className="text-ink-muted" />
                <p className="text-label text-ink">{t("spend.checking")}</p>
              </>
            ) : (
              <>
                <span className="pot-pop grid size-7 shrink-0 place-items-center rounded-pill bg-surface">
                  <Check aria-hidden className="size-5 text-approved" strokeWidth={2.75} />
                </span>
                <div>
                  <p className="text-label text-ink">{t("spend.approved")}</p>
                  <p className="text-body-sm text-ink-muted">{t("feed.instant.rule", { instantLimit: whole(TRIP_RULES.instantCap) })}</p>
                </div>
              </>
            )}
          </div>
        )}
        {phase === "sent" ? (
          <div className="flex items-center justify-between gap-3 px-1">
            <p className="text-body text-ink" data-spend-status>
              {t("spend.sent", { amount: whole(amount) })}
            </p>
            <StatusChip status="sent" />
          </div>
        ) : phase === "approved" ? (
          <div className="flex items-center justify-between gap-3 px-1">
            <p className="text-body text-ink">{t("spend.sending", { amount: whole(amount) })}</p>
            <StatusChip status="sending" />
          </div>
        ) : null}
        {phase !== "checking" ? <InThePot balance={balance} /> : null}
      </div>
    </PhoneSheet>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Chapter 5: the push and the Approve sheet

/** A lock-screen notification: Maya's approval request (chapter 5) or her close request (chapter 6). `text` names
 *  which; the words are the app's own notification copy. */
function Push({ story, text }: SceneProps & { text: string }) {
  const close = story.request === null || /close/i.test(text)
  return (
    <div className="absolute inset-0 flex flex-col items-center bg-surface-sunken px-3 pt-[calc(var(--phone-safe-top)+2.5rem)] dark:bg-ground">
      <p aria-hidden className="font-display text-[4.5rem] leading-none font-bold text-ink tabular-nums">
        {t("home.chat.clock")}
      </p>
      <div className="mt-10 w-full" data-phone-push>
        {close ? (
          <PushCard className="max-w-none" title={t("close.approve.title", { name: PEOPLE.maya.name, potName: story.potName })} body={t("close.body")} />
        ) : (
          <PushCard className="max-w-none" />
        )}
      </div>
    </div>
  )
}

function Approve({ story, people: all, you, tapped, active, onPrimary, done }: SceneProps & { done: boolean }) {
  const req = story.request ?? { amount: "300000000", category: "tickets" as const, requester: "maya" as const }
  const amount = micro(req.amount)
  const requester = all[req.requester]
  const k = 2
  const others = story.membersBefore.filter((p) => p !== req.requester)
  const approvals = done ? [requester, all[you]] : [requester]
  const pending = others.filter((p) => !(done && p === you)).map((p) => all[p])
  const balanceAfter = micro(story.potAfter)
  return (
    <PhoneSheet
      title={t("approve.title", { name: requester.name, amount: whole(amount) })}
      header={
        <div className="flex items-center gap-3">
          <Avatar person={requester} size="md" />
          <div className="min-w-0">
            <h3 className="font-display text-heading text-ink tabular-nums">{t("approve.title", { name: requester.name, amount: whole(amount) })}</h3>
            <p className="text-body-sm text-ink-muted">{t("approve.meta", { potName: story.potName, time: t("home.chat.push.when") })}</p>
          </div>
        </div>
      }
      peek={<PotPeek story={story} members={people(story.membersBefore, all)} balance={micro(story.potBefore)} />}
      footer={
        done ? (
          <Primary active={active} onPrimary={onPrimary}>
            {t("spend.done")}
          </Primary>
        ) : (
          <div className="grid grid-cols-[2fr_1fr] gap-2">
            {tapped ? (
              <Primary active={false} onPrimary={() => {}} busy>
                {t("approve.cta.approving")}
              </Primary>
            ) : (
              <Primary active={active} onPrimary={onPrimary}>
                {t("approve.cta.approve", { amount: whole(amount) })}
              </Primary>
            )}
            <Inert>
              <Button className="min-h-13 w-full">{t("approve.cta.decline")}</Button>
            </Inert>
          </div>
        )
      }
    >
      <div className="flex flex-col gap-4 pt-2" data-phone-approve={done ? "done" : "form"}>
        <div className="flex flex-col items-center gap-1 text-center">
          <MoneyText micro={amount} variant="hero" className="text-ink" />
          <span className="text-body-sm text-ink-muted">{t("approve.reason", { reason: t(`spend.reason.word.${req.category}`) })}</span>
        </div>
        {done ? (
          <div className="flex items-start gap-3 rounded-md bg-surface-sunken p-3">
            <span className="pot-pop grid size-6 shrink-0 place-items-center rounded-pill bg-approved text-surface">
              <Check aria-hidden className="size-4" strokeWidth={3} />
            </span>
            <p className="text-label text-ink tabular-nums">{t("approve.final", { amount: whole(amount), name: requester.name })}</p>
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-md bg-surface-sunken p-3">
            <Clock aria-hidden className="mt-0.5 size-5 shrink-0 text-waiting" strokeWidth={2.25} />
            <p className="text-body-sm text-ink">{t("approve.why.cap", { instantLimit: whole(TRIP_RULES.instantCap) })}</p>
          </div>
        )}
        <ApprovalTimeline r={{ approvals, declines: [], pending, requester, k }} me={you} />
        {done ? (
          <InThePot balance={balanceAfter} />
        ) : (
          <div className="flex items-end justify-between gap-3 border-t border-line px-1 pt-3">
            <span className="text-body-sm text-ink-muted">{t("approve.after.label")}</span>
            <MoneyText micro={balanceAfter} variant="title" className="text-ink" />
          </div>
        )}
      </div>
    </PhoneSheet>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Chapter 6: close

function Close({ story, people: all, you, tapped, active, onPrimary, phase }: SceneProps & { phase: "form" | "approve" | "closed" }) {
  const rows = story.refunds.map((r) => ({ person: all[r.persona], putIn: micro(r.putIn), back: micro(r.back) }))
  const mine = story.refunds.find((r) => r.persona === you)
  const proposer = all.maya
  const k = 2
  if (phase === "closed") {
    return (
      <PhoneSheet title={t("close.done.title")} peek={<PotPeek story={story} members={people(story.membersAfter, all)} balance={0n} />}>
        <div className="flex flex-col gap-4 pt-2" data-phone-closed>
          <ClosedMoment refund={micro(mine?.back ?? "0")} contributed={micro(mine?.putIn ?? "0")} />
          <RefundTable rows={rows} me={you} caption={t("close.table.caption.done")} />
        </div>
      </PhoneSheet>
    )
  }
  const approve = phase === "approve"
  const others = story.membersBefore.filter((p) => p !== "maya").map((p) => all[p])
  return (
    <PhoneSheet
      title={approve ? t("close.approve.title", { name: proposer.name, potName: story.potName }) : t("close.title", { potName: story.potName })}
      peek={<PotPeek story={story} members={people(story.membersBefore, all)} balance={micro(story.potBefore)} />}
      footer={
        tapped && !approve ? undefined : (
          <div className="flex flex-col gap-2">
            {tapped ? (
              <Primary active={false} onPrimary={() => {}} busy>
                {t("approve.cta.approving")}
              </Primary>
            ) : (
              <Primary active={active} onPrimary={onPrimary}>
                {approve ? t("close.approve.cta") : t("close.cta")}
              </Primary>
            )}
            <Inert>
              <Button variant="ghost" className="w-full">
                {approve ? t("close.decline.cta") : t("close.keep")}
              </Button>
            </Inert>
          </div>
        )
      }
    >
      <div className="flex flex-col gap-3 pt-1" data-phone-close={phase}>
        {approve ? (
          <p className="text-body text-ink tabular-nums">{t("close.approve.refund", { refund: formatUsd(micro(mine?.back ?? "0")) })}</p>
        ) : tapped ? null : (
          <p className="text-body-sm text-ink-muted">{t("close.body")}</p>
        )}
        <p className="text-body-sm text-ink-muted tabular-nums">{t("close.math", { balance: formatUsd(micro(story.potBefore)) })}</p>
        <RefundTable rows={rows} me={you} caption={t("close.table.caption")} />
        {tapped && !approve ? (
          <div className="flex flex-col gap-3" data-phone-busy>
            <div className="flex items-start gap-3 rounded-md bg-surface-sunken p-3">
              <Clock aria-hidden className="mt-0.5 size-5 shrink-0 text-waiting" strokeWidth={2.25} />
              <p className="text-label text-ink">{t("close.sent", { remaining: 1 })}</p>
            </div>
            <ApprovalTimeline r={{ approvals: [proposer], declines: [], pending: others, requester: proposer, k }} me={you} />
          </div>
        ) : approve ? (
          <ApprovalTimeline r={{ approvals: [proposer], declines: [], pending: others, requester: proposer, k }} me={you} />
        ) : (
          <p className="text-body-sm text-ink-muted">{t("close.next")}</p>
        )}
      </div>
    </PhoneSheet>
  )
}
