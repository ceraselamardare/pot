"use client"
// "Try the rules" (landing section 4): the visitor is Maya in the D-61 Lisbon Trip and feels the Pot's rules
// decide a spend. Everything runs on local state: no network, no session, no data hooks. The rule maths is the
// app's own (lib/client/rules.ts → @pot/sdk previewSpendDecision, the twin of the hub's decide()) and so is the
// copy (preview.*, spend.*, approve.*, rules.*; ux-spec §4.9-4.10, §6.3-6.4; design-direction 02 §3-4).
//
// One box, the STAGE, sits right above the action button: before the tap it is the neutral preview ("This will be
// approved instantly"); on the tap it becomes the result in the same place (ux-spec: "the sheet morphs into the
// result card"), so the answer is always where the visitor is looking:
//  - inside the rules: "Checking Pot rules…" with the typing dots for the 1.2 s beat → "Approved by Pot rules" on
//    brand-soft + the one 600 ms marigold burst from the button → "$84 sent to you" → "In the Pot" counts down;
//  - over a limit: "Sent to the group" + why, 1 of 2 approvals (Maya's own counts), and the action button becomes
//    [Approve as Leo] → "Approved! …", 2 of 2, check + word and no burst (brand README §8) → the count down.
// Motion (design-direction 04 §4): the stage's height changes only on the visitor's own taps and glides over 280 ms
// (useGlide); every timer-driven state is reserved up front (Layers), so nothing below the card ever moves on its
// own (CLS 0). Text swaps cross-fade, checks pop on the spring, the amount thumb slides, a chip's check slot opens.
// The result carries its own "In the Pot" line, and THAT is the one number that rolls (500 ms): the top balance is
// often off-screen (a phone; a 1280 x 800 laptop with the button centred), so the money always moves where the
// visitor is looking; the top balance follows with a 200 ms fade, so the card never shows two rolls (04 §4). Quick double taps are safe: busy taps are ignored, and after Leo's approval the button
// ignores taps for 400 ms. Reduced motion: no burst, nothing moves or scales, text and numbers swap instantly; the
// 1.2 s beat stays (pacing, not motion). The server HTML is the complete first state (Groceries, $84, the preview,
// the button); nothing reads `window` during render. One polite live region speaks each outcome sentence once.
import { Check, Clock, RotateCcw, UserRound, Users, X, Zap } from "lucide-react"
import { useEffect, useId, useReducer, useRef, type ReactNode, type Ref } from "react"
import { TypingDots } from "@/components/feedback/TypingDots"
import { Celebration } from "@/components/money/Celebration"
import { MoneyText } from "@/components/money/MoneyText"
import { Avatar, AvatarStack } from "@/components/pot/Avatar"
import { CoverTile } from "@/components/pot/CoverTile"
import { StatusChip } from "@/components/pot/StatusChip"
import { Button } from "@/components/ui/button"
import { t, tLines } from "@/i18n/t"
import { prefersReducedMotion } from "@/lib/client/browser"
import { cn } from "@/lib/client/cn"
import { APPROVED_MS, MIN_CHECKING_MS } from "@/lib/client/machines/spend"
import { dollars, formatUsd, type Micro } from "@/lib/client/money"
import { approvalsNeeded, previewSpend, DEFAULT_RULES, type SpendPreview } from "@/lib/client/rules"
import { LiveMoney } from "./motion/LiveMoney"
import { Layers, RulesChip, RulesSegmented, useGlide, type Layer } from "./RulesParts"
import { Section, SectionHead } from "./Section"
import "./play.css"

// ---------------------------------------------------------------------------------------------------------
// The D-61 demo story: Maya, Sam and Leo put in $150 each; the Pot holds $450.00.

const MAYA = { id: "maya", name: "Maya", initials: "M", joinIndex: 0 }
const SAM = { id: "sam", name: "Sam", initials: "S", joinIndex: 1 }
const LEO = { id: "leo", name: "Leo", initials: "L", joinIndex: 2 }
const PEOPLE = [MAYA, SAM, LEO]
const START_BALANCE = dollars(450)
const MAYA_PUT_IN = dollars(150)
const K = approvalsNeeded(PEOPLE.length) // 2 of 3
const PRESETS = [20, 84, 150, 300] as const
const REASONS = [
  { id: "groceries", label: "spend.reason.chip.groceries" },
  { id: "dinner", label: "home.try.reason.dinner" },
  { id: "boat", label: "home.try.reason.boat" },
] as const

/** duration-moderate: the stage's glide, and how long a closing result stays to fade under it */
const GLIDE_MS = 280
/** after [Approve as Leo] the same button is Spend again: taps on it are ignored this long, so the second tap of a
 *  double tap never closes the result or starts a new spend */
const GUARD_MS = 400

type ReasonId = (typeof REASONS)[number]["id"]
type RuleId = "instant" | "group" | "person"

/** Sentences and buttons keep whole dollars ("Spend $84"); displayed amounts use MoneyText ("$84.00"). */
const whole = (m: Micro) => formatUsd(m, "whole")
const INSTANT_LIMIT = whole(DEFAULT_RULES.instantCap)
const MEMBER_LIMIT = whole(DEFAULT_RULES.memberBudget)

// ---------------------------------------------------------------------------------------------------------
// State: the Pot (balance, Maya's spends without asking), the picker, the last spend's outcome, and the outcome the
// stage is closing (while it fades under the glide back to the preview).

interface Spend {
  amount: Micro
  reason: ReasonId
  preview: SpendPreview
  /** Maya's spends without asking before this one (the over-the-$200 sentence quotes it) */
  usedBefore: Micro
}

type OutcomeTag = "checking" | "approved" | "sent" | "asked" | "groupApproved"
type Outcome = { tag: OutcomeTag; spend: Spend }
type Phase = { tag: "idle" } | Outcome

interface State {
  balance: Micro
  /** member_budget counts spends made without asking only (D-07) */
  used: Micro
  reason: ReasonId
  amount: Micro
  phase: Phase
  /** bumps on every spend (restarts the typing dots) */
  seq: number
  /** the result the stage is closing: it stays one glide long, fading, then goes ("settled") */
  closing: Outcome | null
}

type Action =
  | { type: "reason"; id: ReasonId }
  | { type: "amount"; amount: Micro }
  | { type: "spend" }
  | { type: "checked" }
  | { type: "shown" }
  | { type: "approveAsLeo" }
  | { type: "reset" }
  | { type: "settled" }

const INITIAL: State = {
  balance: START_BALANCE,
  used: 0n,
  reason: "groceries",
  amount: dollars(84),
  phase: { tag: "idle" },
  seq: 0,
  closing: null,
}

/** While the rules check, approve or wait for the group, the picker is locked and Spend does nothing. */
const isBusy = (p: Phase): p is { tag: "checking" | "approved" | "asked"; spend: Spend } =>
  p.tag === "checking" || p.tag === "approved" || p.tag === "asked"
/** A finished result: the stage shows it until the visitor touches the picker again. */
const isDone = (p: Phase): p is { tag: "sent" | "groupApproved"; spend: Spend } => p.tag === "sent" || p.tag === "groupApproved"

function previewFor(s: Pick<State, "amount" | "balance" | "used">): SpendPreview {
  return previewSpend({
    amount: s.amount,
    balance: s.balance,
    rules: DEFAULT_RULES,
    memberCount: PEOPLE.length,
    used: s.used,
    contributed: MAYA_PUT_IN,
    receiverIsMember: true,
  })
}

/** Back to the preview: a finished result closes (fading under the glide) instead of vanishing. */
const toPreview = (s: State, patch: Partial<State>): State =>
  isDone(s.phase) ? { ...s, ...patch, phase: { tag: "idle" }, closing: s.phase } : { ...s, ...patch }

export function playgroundReducer(s: State, a: Action): State {
  switch (a.type) {
    case "reset":
      return { ...INITIAL, seq: s.seq, closing: s.phase.tag === "idle" ? s.closing : s.phase }
    case "settled":
      return s.closing ? { ...s, closing: null } : s
    case "reason":
      return isBusy(s.phase) ? s : toPreview(s, { reason: a.id })
    case "amount":
      return isBusy(s.phase) ? s : toPreview(s, { amount: a.amount })
    case "spend": {
      if (isBusy(s.phase)) return s
      const preview = previewFor(s)
      // over the balance is "blocked": the button says no, and tapping it after a result shows the preview's why
      if (preview.path !== "instant" && preview.path !== "vote") return toPreview(s, {})
      const spend: Spend = { amount: s.amount, reason: s.reason, preview, usedBefore: s.used }
      return { ...s, phase: { tag: "checking", spend }, seq: s.seq + 1, closing: null }
    }
    case "checked":
      if (s.phase.tag !== "checking") return s
      return { ...s, phase: { tag: s.phase.spend.preview.path === "instant" ? "approved" : "asked", spend: s.phase.spend } }
    case "shown": {
      if (s.phase.tag !== "approved") return s
      const { amount } = s.phase.spend
      if (amount > s.balance) return s // never below $0.00
      return { ...s, balance: s.balance - amount, used: s.used + amount, phase: { tag: "sent", spend: s.phase.spend } }
    }
    case "approveAsLeo": {
      if (s.phase.tag !== "asked") return s
      const { amount } = s.phase.spend
      if (amount > s.balance) return s
      return { ...s, balance: s.balance - amount, phase: { tag: "groupApproved", spend: s.phase.spend } }
    }
  }
}

// ---------------------------------------------------------------------------------------------------------
// Copy

/** The preview sentence (ux-spec §4.9 table): title + reason, from the same keys as the Spend sheet. */
function previewLines(p: Pick<SpendPreview, "reason"> & Partial<SpendPreview>, balance: Micro, used: Micro): [string, string | null] {
  switch (p.reason) {
    case "ok":
      return tLines("preview.instant", { instantLimit: INSTANT_LIMIT })
    case "over_cap":
      return tLines("preview.vote.over_cap", { k: K, n: PEOPLE.length, instantLimit: INSTANT_LIMIT })
    case "over_budget":
      return tLines("preview.vote.over_budget", { k: K, n: PEOPLE.length, memberBudget: MEMBER_LIMIT, used: whole(used) })
    case "balance":
      return tLines("preview.blocked.balance", { balance: formatUsd(balance) })
    default:
      // empty / recipient / new member can't happen here: Maya put money in and always reimburses herself
      return [t("preview.empty", { instantLimit: INSTANT_LIMIT }), null]
  }
}

/** Why a spend went to the group, in the rules' words ("It's over the $100 instant limit."). */
function whyGroup(spend: Spend): string {
  return previewLines(spend.preview, 0n, spend.usedBefore)[1] ?? ""
}

/** The one sentence the live region speaks for each outcome (and nothing in between). */
function liveSentence(phase: Phase): string {
  if (phase.tag === "sent") return `${t("spend.approved")}. ${t("spend.sent", { amount: whole(phase.spend.amount) })}.`
  if (phase.tag === "asked") {
    const [sent] = tLines("spend.vote_sent", { k: K, n: PEOPLE.length })
    return `${sent}. ${whyGroup(phase.spend)} ${t("approve.own.counted", { remaining: K - 1 })}`
  }
  if (phase.tag === "groupApproved") return t("approve.final", { amount: whole(phase.spend.amount), name: MAYA.name })
  return ""
}

function ruleOf(p: SpendPreview): RuleId | null {
  return p.reason === "ok" ? "instant" : p.reason === "over_cap" ? "group" : p.reason === "over_budget" ? "person" : null
}

const reasonLabel = (id: ReasonId) => t((REASONS.find((r) => r.id === id) ?? REASONS[0]).label)

// ---------------------------------------------------------------------------------------------------------

export function RulesPlayground({ id = "rules", className }: { id?: string; className?: string }) {
  const [s, dispatch] = useReducer(playgroundReducer, INITIAL)
  const uid = useId()
  const titleId = `${uid}-title`
  const reasonId = `${uid}-reason`
  const previewId = `${uid}-preview`
  const leoId = `${uid}-leo`
  const actionRef = useRef<HTMLButtonElement>(null)
  const resetRef = useRef<HTMLButtonElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const capsuleRef = useRef<HTMLDivElement>(null)
  const balanceRef = useRef<HTMLParagraphElement>(null)

  const { phase } = s
  const tag = phase.tag
  useEffect(() => {
    // the 1.2 s "Checking Pot rules" beat, then 600 ms of "Approved by Pot rules" before the money moves
    const ms = tag === "checking" ? MIN_CHECKING_MS : tag === "approved" ? APPROVED_MS : null
    if (ms === null) return
    const timer = setTimeout(() => dispatch({ type: tag === "checking" ? "checked" : "shown" }), ms)
    return () => clearTimeout(timer)
  }, [tag])
  useEffect(() => {
    // a closing result stays one glide long (none under reduced motion), then goes
    if (!s.closing) return
    const timer = setTimeout(() => dispatch({ type: "settled" }), prefersReducedMotion() ? 0 : GLIDE_MS)
    return () => clearTimeout(timer)
  }, [s.closing])

  // the stage's height glides on the visitor's taps (every timer-driven state is already reserved)
  useGlide(stageRef, s)
  // money moved: the top balance fades to its new amount while the result's line rolls (one roll per spend)
  const shownBalance = useRef(s.balance)
  useEffect(() => {
    if (shownBalance.current === s.balance) return
    shownBalance.current = s.balance
    if ((tag === "sent" || tag === "groupApproved") && !prefersReducedMotion()) once(balanceRef.current, [{ opacity: 0 }, { opacity: 1 }], 200)
  }, [s.balance, tag])

  const preview = previewFor(s)
  const busy = isBusy(phase)
  const canSpend = !busy && (preview.path === "instant" || preview.path === "vote")
  const dirty = s.balance !== START_BALANCE || s.used !== 0n || tag !== "idle"
  /** the result the stage shows (or is closing); null = the preview */
  const result: Outcome | null = tag !== "idle" ? phase : s.closing
  const highlight = tag !== "idle" ? ruleOf(phase.spend.preview) : ruleOf(preview)

  // the action button: [Spend $84], or [Approve as Leo] while the group decides
  const job = tag === "asked" ? "approve" : "spend"
  const guardUntil = useRef(0)
  const blocked = job === "spend" && !canSpend

  const onAction = () => {
    if (Date.now() < guardUntil.current) return // the second tap of a double tap on [Approve as Leo]
    if (job === "spend") return dispatch({ type: "spend" })
    guardUntil.current = Date.now() + GUARD_MS
    // Leo's approval: if the same amount can't be spent next, focus never stays on a "no" button: it moves to the
    // result (no scroll: the visitor is already looking at it)
    const amount = phase.tag === "asked" ? phase.spend.amount : 0n
    const next = previewFor({ amount: s.amount, balance: s.balance - amount, used: s.used })
    const focused = document.activeElement === actionRef.current
    dispatch({ type: "approveAsLeo" })
    if (focused && next.path === "blocked") capsuleRef.current?.focus({ preventScroll: true })
  }
  const reset = () => {
    // the icon turns once (rewind), the balance snaps back with a 200 ms fade (no money moved, so nothing rolls)
    if (!prefersReducedMotion()) {
      once(resetRef.current?.querySelector("svg"), [{ rotate: "0deg" }, { rotate: "-360deg" }], 360)
      if (s.balance !== START_BALANCE) once(balanceRef.current, [{ opacity: 0 }, { opacity: 1 }], 200)
    }
    const focused = document.activeElement === resetRef.current
    dispatch({ type: "reset" })
    // "Start over" goes away, so focus moves to Spend, without scrolling the page
    if (focused) actionRef.current?.focus({ preventScroll: true })
  }

  return (
    <Section
      id={id}
      labelledBy={titleId}
      band="sunken"
      // Night (detail audit D4): the play area's band sits one step BELOW the card (ground, with the band's edge
      // as a hairline), so the card reads raised over its stage, as every Night card does; tokens only
      className={cn("dark:border-y dark:border-line dark:bg-ground", className)}
      innerClassName="@container/try"
    >
      {/* top-aligned, so the text never moves while the card grows with an outcome */}
      <div
        data-rules-playground
        className="grid gap-6 @3xl/try:grid-cols-[minmax(0,1fr)_minmax(0,27rem)] @3xl/try:items-start @3xl/try:gap-12"
      >
        {/* from 768 px the rules stay beside the card while it grows (the deciding one keeps its highlight in view) */}
        <div className="min-w-0 @3xl/try:sticky @3xl/try:top-24 @3xl/try:pt-6">
          <SectionHead id={titleId} eyebrow={t("home.try.eyebrow")} title={t("home.try.title")} intro={t("home.try.lead")} />
          <RuleList highlight={highlight} used={s.used} />
        </div>

        <div
          className="flex w-full max-w-flow min-w-0 flex-col gap-5 rounded-lg bg-surface p-4 shadow-card dark:ring-1 dark:ring-line @md/try:p-6 @3xl/try:max-w-none"
          data-try-card
        >
          {/* The Pot: who's in and how much it holds */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <CoverTile emoji="🇵🇹" cover={0} size="md" />
              <div className="min-w-0 flex-1">
                <h3 className="font-display text-heading text-ink">{t("home.try.pot.name")}</h3>
                <p className="text-body-sm text-ink-muted">{t("home.try.pot.members")}</p>
              </div>
              <AvatarStack people={PEOPLE} size="sm" ring="surface" />
            </div>
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-body-sm text-ink-muted">{t("pot.hero.label")}</p>
                <p data-try-balance ref={balanceRef}>
                  {/* the result's line rolls; this one fades to the new amount (and snaps back on "Start over") */}
                  <LiveMoney micro={s.balance} roll={false} variant="hero" className="text-ink" />
                </p>
              </div>
              <button
                ref={resetRef}
                type="button"
                onClick={reset}
                data-hidden={dirty ? undefined : ""}
                aria-hidden={dirty ? undefined : true}
                inert={!dirty}
                className="play-reset -mr-2 mb-1 inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-sm px-2 font-sans text-label text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
              >
                <RotateCcw aria-hidden className="size-4" strokeWidth={2} />
                {t("home.try.reset")}
              </button>
            </div>
          </div>

          {/* What it's for and how much: locked while the rules decide */}
          <fieldset disabled={busy} className="play-dim m-0 flex min-w-0 flex-col gap-4 border-0 p-0 disabled:opacity-60">
            <div className="play-chips min-w-0">
              <p id={reasonId} className="mb-2 text-body-sm text-ink-muted">
                {t("spend.reason.label")}
              </p>
              <div role="group" aria-labelledby={reasonId} className="flex flex-wrap gap-2">
                {REASONS.map((r) => (
                  <RulesChip key={r.id} selected={s.reason === r.id} onClick={() => dispatch({ type: "reason", id: r.id })}>
                    {t(r.label)}
                  </RulesChip>
                ))}
              </div>
            </div>
            <div className="min-w-0">
              <p aria-hidden className="mb-2 text-body-sm text-ink-muted">
                {t("spend.amount.label")}
              </p>
              <RulesSegmented
                label={t("spend.amount.label")}
                value={String(toWholeDollars(s.amount))}
                onChange={(v) => dispatch({ type: "amount", amount: dollars(Number(v)) })}
                options={PRESETS.map((d) => ({ value: String(d), label: whole(dollars(d)) }))}
                className="tabular-nums"
              />
            </div>
          </fieldset>

          {/* The stage: the preview before the tap, the result after it, in the same place right above the button */}
          <div
            ref={stageRef}
            aria-busy={tag === "checking" || undefined}
            data-try-outcome={tag}
            data-try-stage={result ? "result" : "preview"}
            className="flex min-w-0 flex-col [overflow-anchor:none]"
          >
            <Capsule
              ref={capsuleRef}
              previewId={previewId}
              preview={preview}
              balance={s.balance}
              used={s.used}
              result={tag !== "idle" ? phase : null}
              closing={s.closing}
              seq={s.seq}
            />
            {result && (
              <ResultRows key={result.spend.preview.path} result={result} closing={tag === "idle"} balance={s.balance} leoId={leoId} />
            )}
          </div>

          <div className="relative">
            <Celebration play={tag === "approved"} />
            <div className={cn("play-dim", busy && job === "spend" && "opacity-60", !busy && blocked && "opacity-50")}>
              <Button
                ref={actionRef}
                aria-disabled={busy && job === "spend" ? true : blocked || undefined}
                aria-describedby={job === "spend" ? previewId : leoId}
                onClick={onAction}
                data-try-spend
                data-try-approve={job === "approve" || undefined}
                className={cn(
                  "w-full tabular-nums",
                  // a "no" button never answers like a yes: no hover fill, no press
                  "aria-disabled:hover:bg-surface aria-disabled:active:scale-100 dark:aria-disabled:hover:bg-transparent",
                  blocked && "cursor-not-allowed",
                  busy && job === "spend" && "cursor-progress",
                )}
              >
                {job === "approve" ? (
                  <span key="approve" className="play-label inline-flex items-center gap-2">
                    <Check aria-hidden className="size-5" strokeWidth={2} />
                    {t("home.try.leo.cta")}
                  </span>
                ) : (
                  <span key="spend" className={cn(tag === "groupApproved" && "play-label")}>
                    {t("home.try.cta", { amount: whole(s.amount) })}
                  </span>
                )}
              </Button>
            </div>
          </div>

          <p role="status" aria-live="polite" aria-atomic="true" className="sr-only" data-try-live>
            {liveSentence(phase)}
          </p>
        </div>
      </div>
    </Section>
  )
}

const toWholeDollars = (m: Micro) => Number(m / 1_000_000n)

/** A one-off Web Animation on ease-standard (where the API exists). */
function once(el: Element | null | undefined, keyframes: Keyframe[], ms: number) {
  if (el && typeof el.animate === "function") el.animate(keyframes, { duration: ms, easing: "cubic-bezier(0.2, 0, 0, 1)" })
}

function RuleList({ highlight, used }: { highlight: RuleId | null; used: Micro }) {
  // "You've used $84 of it." appears when the money moves (a timer), so its line is always there, invisible until
  // then: the card below never moves (on phones the list sits above it)
  const usedLine = t("rules.budget.used", { used: whole(used > 0n ? used : dollars(84)) })
  const rows = [
    { id: "instant", Icon: Zap, text: t("rules.instant", { instantLimit: INSTANT_LIMIT }), sub: null },
    { id: "group", Icon: Users, text: t("rules.threshold", { k: K, n: PEOPLE.length }), sub: null },
    {
      id: "person",
      Icon: UserRound,
      text: t("rules.budget", { memberBudget: MEMBER_LIMIT }),
      sub: usedLine,
    },
  ] as const
  return (
    <div>
      <h3 className="text-label text-ink">{t("rules.label")}</h3>
      {/* the highlight keeps the page's gutter on phones; it hangs into the column's margin only beside the card */}
      <ul className="mt-1 flex flex-col gap-1 @3xl/try:-mx-3">
        {rows.map(({ id, Icon, text, sub }) => (
          <li
            key={id}
            data-rule={id}
            data-active={highlight === id || undefined}
            className={cn(
              "flex items-start gap-3 rounded-md px-3 py-2 transition-colors duration-200 ease-standard motion-reduce:transition-none",
              highlight === id && "bg-surface dark:ring-1 dark:ring-line",
            )}
          >
            <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-ink" strokeWidth={2} />
            <div className="min-w-0">
              <p className="text-body text-pretty text-ink tabular-nums">{text}</p>
              {sub && (
                <p
                  aria-hidden={used > 0n ? undefined : true}
                  className={cn("play-fade-line text-body-sm text-ink-muted tabular-nums", used > 0n ? "opacity-100" : "invisible opacity-0")}
                >
                  {sub}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------------
// The stage's capsule: the one box that is the preview and then the rules' answer. Every sentence it can show for
// this spend is stacked in it (Layers), so it never changes height on a timer.

type CapsuleLayer = "p:ok" | "p:over_cap" | "p:over_budget" | "p:balance" | "checking" | "rules" | "asked" | "group"

function capsuleLayerOf(result: Outcome | null, preview: SpendPreview): CapsuleLayer {
  if (!result) {
    const r = preview.reason
    return r === "over_cap" || r === "over_budget" || r === "balance" ? `p:${r}` : "p:ok"
  }
  if (result.tag === "checking") return "checking"
  if (result.tag === "approved" || result.tag === "sent") return "rules"
  return result.tag === "asked" ? "asked" : "group"
}

function Lines({ title, body, id }: { title: ReactNode; body?: ReactNode; id?: string }) {
  return (
    <div id={id} className="min-w-0">
      <p className="text-label text-pretty text-ink tabular-nums">{title}</p>
      {body ? <p className="mt-0.5 text-body-sm text-pretty text-ink-muted tabular-nums">{body}</p> : null}
    </div>
  )
}

function Capsule({
  ref,
  previewId,
  preview,
  balance,
  used,
  result,
  closing,
  seq,
}: {
  ref: Ref<HTMLDivElement>
  previewId: string
  preview: SpendPreview
  balance: Micro
  used: Micro
  /** the live result (null while the preview shows, even if a finished one is still closing) */
  result: Outcome | null
  closing: Outcome | null
  seq: number
}) {
  const on = capsuleLayerOf(result, preview)
  /** the preview's layer describes Spend (aria-describedby) even while the result shows */
  const described = capsuleLayerOf(null, preview)
  const spend = (result ?? closing)?.spend
  const lines = (reason: SpendPreview["reason"], u = used) => previewLines({ reason }, balance, u)
  const pv = (reason: SpendPreview["reason"], key: CapsuleLayer): Layer => {
    const [title, body] = lines(reason)
    return { id: key, node: <Lines id={described === key ? previewId : undefined} title={title} body={body} /> }
  }
  const text: Layer[] = [
    pv("ok", "p:ok"),
    pv("over_cap", "p:over_cap"),
    pv("over_budget", "p:over_budget"),
    pv("balance", "p:balance"),
    // the longest preview, with a 3-digit total, so the box is as tall as it will ever need to be for it
    { id: "sizer", node: <Lines title={lines("over_budget")[0]} body={lines("over_budget", dollars(188))[1]} /> },
  ]
  const icons: Layer[] = [
    { id: "p:ok", node: <Check aria-hidden className="size-5 text-approved" strokeWidth={2} /> },
    { id: "p:over_cap", node: <Clock aria-hidden className="size-5 text-waiting" strokeWidth={2} /> },
    { id: "p:over_budget", node: <Clock aria-hidden className="size-5 text-waiting" strokeWidth={2} /> },
    { id: "p:balance", node: <X aria-hidden className="size-5 text-declined" strokeWidth={2} /> },
  ]
  if (spend) {
    const instant = spend.preview.path === "instant"
    const amount = whole(spend.amount)
    text.push({ id: "checking", enter: true, node: <Lines title={t("spend.checking")} /> })
    icons.push({ id: "checking", enter: true, node: <TypingDots key={seq} size="sm" className="text-ink-muted" /> })
    if (instant) {
      text.push({ id: "rules", node: <Lines title={t("spend.approved")} body={t("feed.instant.rule", { instantLimit: INSTANT_LIMIT })} /> })
      icons.push({ id: "rules", node: <Check aria-hidden className="play-pop size-5 text-approved" strokeWidth={2} /> })
    } else {
      text.push(
        { id: "asked", node: <Lines title={tLines("spend.vote_sent", { k: K, n: PEOPLE.length })[0]} body={whyGroup(spend)} /> },
        { id: "group", node: <Lines title={t("approve.final", { amount, name: MAYA.name })} /> },
      )
      icons.push(
        { id: "asked", node: <Clock aria-hidden className="play-pop size-5 text-waiting" strokeWidth={2} /> },
        { id: "group", node: <Check aria-hidden className="play-pop size-5 text-approved" strokeWidth={2} /> },
      )
    }
  }
  return (
    <div
      ref={ref}
      tabIndex={-1}
      data-capsule
      data-rule-preview={preview.path}
      className={cn(
        "play-capsule flex items-center gap-3 rounded-md p-3 outline-offset-2",
        on === "rules" ? "bg-brand-soft" : "bg-surface-sunken",
      )}
    >
      <span className="grid size-7 shrink-0 place-items-center rounded-pill bg-surface">
        <Layers on={on} layers={icons} className="place-items-center" />
      </span>
      <Layers on={on} layers={text} className="min-w-0 flex-1 self-center" />
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------------
// The result's rows under the capsule: what the money is doing, who approved (group), and the Pot's balance (below
// a 768 px container, where the top balance is often off-screen). Each row stacks this path's states.

function ResultRows({ result, closing, balance, leoId }: { result: Outcome; closing: boolean; balance: Micro; leoId: string }) {
  const { tag, spend } = result
  const instant = spend.preview.path === "instant"
  const amount = whole(spend.amount)
  const status: Layer[] = [
    {
      id: "checking",
      node: (
        <Row>
          <p className="min-w-0 text-body-sm text-ink-muted">{reasonLabel(spend.reason)}</p>
          <MoneyText micro={spend.amount} variant="row" className="text-ink" />
        </Row>
      ),
    },
  ]
  if (instant)
    status.push(
      {
        id: "approved",
        node: (
          <Row>
            <p className="min-w-0 text-body text-ink tabular-nums">{t("spend.sending", { amount })}</p>
            <StatusChip status="sending" />
          </Row>
        ),
      },
      {
        id: "sent",
        node: (
          <Row>
            <p className="min-w-0 text-body text-ink tabular-nums" data-try-status>
              {t("spend.sent", { amount })}
            </p>
            <StatusChip status="sent" className="play-pop play-pop-chip" />
          </Row>
        ),
      },
    )
  else
    status.push(
      {
        id: "asked",
        node: (
          <Row>
            <p className="min-w-0 text-body-sm text-ink-muted">{reasonLabel(spend.reason)}</p>
            <StatusChip status="needs" className="play-pop play-pop-chip tabular-nums">
              {t("approve.progress", { count: 1, k: K })}
            </StatusChip>
          </Row>
        ),
      },
      {
        id: "groupApproved",
        node: (
          <Row>
            <p className="min-w-0 text-body-sm text-ink-muted">{reasonLabel(spend.reason)}</p>
            <StatusChip status="approved" className="play-pop play-pop-chip tabular-nums">
              {t("approve.progress", { count: K, k: K })}
            </StatusChip>
          </Row>
        ),
      },
    )
  const who: Layer[] = [
    {
      id: "asked",
      node: (
        <p id={leoId} className="flex items-start gap-2 text-body-sm text-pretty text-ink-muted">
          <Avatar person={LEO} size="xs" />
          <span className="min-w-0">{t("home.try.leo.hint")}</span>
        </p>
      ),
    },
    {
      id: "groupApproved",
      node: (
        <p className="flex items-start gap-2 text-body-sm text-pretty text-ink-muted">
          <AvatarStack people={[MAYA, LEO]} size="xs" ring="surface" />
          <span className="min-w-0">{t("feed.approved.sub", { names: t("feed.and", { a: MAYA.name, b: LEO.name }) })}</span>
        </p>
      ),
    },
  ]
  // the status row's layer for this moment ("approved" and "sent" are their own rows on the instant path)
  const statusOn = tag === "checking" ? "checking" : tag
  return (
    <div
      data-closing={closing || undefined}
      aria-hidden={closing || undefined}
      inert={closing}
      className="play-rows mt-3 flex flex-col gap-2 px-1"
      data-try-result={tag}
    >
      <Layers on={statusOn} layers={status} />
      {!instant && <Layers on={tag === "asked" || tag === "groupApproved" ? tag : null} layers={who} />}
      {/* the money moving, where the visitor is looking: the one roll of a spend */}
      <p className="mt-1 flex items-baseline justify-between gap-3 border-t border-line pt-3" data-try-stage-balance>
        <span className="text-body-sm text-ink-muted">{t("pot.hero.label")}</span>
        <LiveMoney micro={balance} roll={!closing && (tag === "sent" || tag === "groupApproved")} ghost="end" variant="title" className="text-ink" />
      </p>
    </div>
  )
}

function Row({ children }: { children: ReactNode }) {
  return <div className="flex min-h-7 flex-wrap items-center justify-between gap-x-3 gap-y-1">{children}</div>
}
