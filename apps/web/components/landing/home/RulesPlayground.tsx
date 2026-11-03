"use client"
// "Try the rules" (landing section 4): the visitor is Maya in the D-61 Lisbon Trip and feels the Pot's rules
// decide a spend. Everything runs on local state: no network, no session, no data hooks. The rules are the ones a
// Pot made today starts with (DEFAULT_RULES + the hub's defaultExtras: $100 at a time and $200 per person without
// asking, trust on, one OK up to $300), the maths is the app's own (lib/client/rules.ts → @pot/sdk
// previewSpendDecision, the twin of the hub's decide()), the preview's words are the Spend sheet's (RulePreview
// previewCopy) and the rest of the copy is the app's too (spend.*, approve.*, feed.*, rules.*; ux-spec §4.9-4.10,
// §6.3-6.4; design-direction 02 §3-4).
//
// One box, the STAGE, sits right above the action button: before the tap it is the neutral preview ("This will be
// approved instantly"); on the tap it becomes the result in the same place (ux-spec: "the sheet morphs into the
// result card"), so the answer is always where the visitor is looking. The presets ($20 · $84 · $300 · $400) reach
// all three roads:
//  - inside the rules ($20, $84): "Checking Pot rules…" with the typing dots for the 1.2 s beat → "Approved by Pot
//    rules" on brand-soft + the one 600 ms marigold burst from the button → "$84 sent to you" → "In the Pot" counts down;
//  - one OK (over Maya's instant limit up to $300, the $300; or over the $200 she can spend without asking): "Sent ·
//    One OK from anyone else…", "Needs one OK", and the action button becomes [OK $300 as Leo] (the app's [OK $300])
//    → "Approved by Leo's OK", check + word and no burst (brand README §8) → the count down;
//  - the group (over $300, the $400): "Sent to the group" + why, 1 of 2 approvals (Maya's own counts), and the button
//    becomes [Approve as Leo] → "Approved! …", 2 of 2, no burst → the count down.
// Maya's trust is tracked as the hub tracks it (trust_settle; the mock's wave4.ts): every paid spend of a tenth of the
// instant limit or more counts, every 3rd raises her instant limit by $100, up to $300 (nobody declines here, so it
// never drops). The $200 she can spend without asking in total still caps it. The spend that raises it says so in one
// line ("Trust grows: you can now spend up to $200 at a time without asking."), reserved from the tap like every
// other state.
// Motion (design-direction 04 §4): the stage's height changes only on the visitor's own taps and glides over 280 ms
// (useGlide); every timer-driven state is reserved up front (Layers), so nothing below the card ever moves on its
// own (CLS 0). Text swaps cross-fade, checks pop on the spring, the amount thumb slides, a chip's check slot opens.
// The result carries its own "In the Pot" line, and THAT is the one number that rolls (500 ms): the top balance is
// often off-screen (a phone; a 1280 x 800 laptop with the button centred), so the money always moves where the
// visitor is looking; the top balance follows with a 200 ms fade, so the card never shows two rolls (04 §4). Quick
// double taps are safe: busy taps are ignored, and after Leo's OK or approval the button ignores taps for 400 ms.
// Reduced motion: no burst, nothing moves or scales, text and numbers swap instantly; the 1.2 s beat stays (pacing,
// not motion). The server HTML is the complete first state (Groceries, $84, the preview, the button); nothing reads
// `window` during render. One polite live region speaks each outcome sentence once.
import { Check, Clock, Hand, RotateCcw, Sprout, UserRound, Users, X, Zap } from "lucide-react"
import { useEffect, useId, useReducer, useRef, type ReactNode, type Ref } from "react"
import { defaultExtras, WAVE4_LIMITS } from "@pot/sdk"
import { TypingDots } from "@/components/feedback/TypingDots"
import { Celebration } from "@/components/money/Celebration"
import { MoneyText } from "@/components/money/MoneyText"
import { Avatar, AvatarStack } from "@/components/pot/Avatar"
import { CoverTile } from "@/components/pot/CoverTile"
import { StatusChip } from "@/components/pot/StatusChip"
import { previewCopy } from "@/components/sheets/RulePreview"
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
// The D-61 demo story: Maya, Sam and Leo put in $150 each; the Pot holds $450.00. Its rules are a new Pot's.

const MAYA = { id: "maya", name: "Maya", initials: "M", joinIndex: 0 }
const SAM = { id: "sam", name: "Sam", initials: "S", joinIndex: 1 }
const LEO = { id: "leo", name: "Leo", initials: "L", joinIndex: 2 }
const PEOPLE = [MAYA, SAM, LEO]
const N = PEOPLE.length
const START_BALANCE = dollars(450)
const MAYA_PUT_IN = dollars(150)
const RULES = DEFAULT_RULES
/** what the hub gives a Pot made today (defaultExtras): earned trust on, one OK up to 3 × the instant limit ($300) */
const { trust: TRUST_ON, oneOkCap: ONE_OK_CAP } = defaultExtras({ ...RULES, payeeAllowlist: [] })
const EXTRAS = { trust: TRUST_ON, oneOkCap: ONE_OK_CAP }
const K = approvalsNeeded(N) // 2 of 3
const PRESETS = [20, 84, 300, 400] as const
const REASONS = [
  { id: "groceries", label: "spend.reason.chip.groceries" },
  { id: "dinner", label: "home.try.reason.dinner" },
  { id: "boat", label: "home.try.reason.boat" },
] as const

/** duration-moderate: the stage's glide, and how long a closing result stays to fade under it */
const GLIDE_MS = 280
/** after Leo's OK or approval the same button is Spend again: taps on it are ignored this long, so the second tap of
 *  a double tap never closes the result or starts a new spend */
const GUARD_MS = 400

type ReasonId = (typeof REASONS)[number]["id"]
type RuleId = "instant" | "oneok" | "group" | "person"

/** Sentences and buttons keep whole dollars ("Spend $84"); displayed amounts use MoneyText ("$84.00"). */
const whole = (m: Micro) => formatUsd(m, "whole")
const INSTANT_LIMIT = whole(RULES.instantCap)
const MEMBER_LIMIT = whole(RULES.memberBudget)
const ONE_OK_LIMIT = whole(ONE_OK_CAP)

// ---------------------------------------------------------------------------------------------------------
// Earned trust, as the hub counts it (lib.rs trust_settle; lib/client/mock/wave4.ts trustSettle).

interface Trust {
  /** 0-2: the instant limit is the Pot's × (1 + level) */
  level: number
  /** qualifying paid spends toward the next level */
  streak: number
}

const NEW_MEMBER: Trust = { level: 0, streak: 0 }

/** A paid spend counts once when it is at least a tenth of the instant limit; every 3rd raises the level, up to 2. */
export function settleTrust(tr: Trust, amount: Micro): Trust {
  if (amount * WAVE4_LIMITS.trustMinSpendDiv < RULES.instantCap) return tr
  const streak = Math.min(WAVE4_LIMITS.trustStep, tr.streak + 1)
  return streak >= WAVE4_LIMITS.trustStep && tr.level < WAVE4_LIMITS.trustMaxLevel ? { level: tr.level + 1, streak: 0 } : { level: tr.level, streak }
}

/** The instant limit at a trust level (the hub's effective_cap). */
const limitAt = (level: number) => RULES.instantCap * BigInt(1 + (TRUST_ON ? level : 0))

// ---------------------------------------------------------------------------------------------------------
// State: the Pot (balance, Maya's spends without asking, her trust), the picker, the last spend's outcome, and the
// outcome the stage is closing (while it fades under the glide back to the preview).

interface Spend {
  amount: Micro
  reason: ReasonId
  preview: SpendPreview
  /** Maya's spends without asking before this one (the over-the-$200 sentence quotes it) */
  usedBefore: Micro
  /** her trust once this spend is paid (the hub counts it then) */
  trustAfter: Trust
  /** the level this spend raises her to when it's paid (its one line is reserved from the tap), else null */
  levelUp: number | null
}

/** asked: waiting for Leo (his OK, or the group's second approval); leoApproved: he said yes and the money moved */
type OutcomeTag = "checking" | "approved" | "sent" | "asked" | "leoApproved"
type Outcome = { tag: OutcomeTag; spend: Spend }
type Phase = { tag: "idle" } | Outcome

interface State {
  balance: Micro
  /** member_budget counts spends made without asking only (D-07) */
  used: Micro
  trust: Trust
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
  trust: NEW_MEMBER,
  reason: "groceries",
  amount: dollars(84),
  phase: { tag: "idle" },
  seq: 0,
  closing: null,
}

/** While the rules check, approve or wait for Leo, the picker is locked and Spend does nothing. */
const isBusy = (p: Phase): p is { tag: "checking" | "approved" | "asked"; spend: Spend } =>
  p.tag === "checking" || p.tag === "approved" || p.tag === "asked"
/** A finished result: the stage shows it until the visitor touches the picker again. */
const isDone = (p: Phase): p is { tag: "sent" | "leoApproved"; spend: Spend } => p.tag === "sent" || p.tag === "leoApproved"

function previewFor(s: Pick<State, "amount" | "balance" | "used" | "trust">): SpendPreview {
  return previewSpend({
    amount: s.amount,
    balance: s.balance,
    rules: RULES,
    memberCount: N,
    used: s.used,
    contributed: MAYA_PUT_IN,
    receiverIsMember: true,
    extras: EXTRAS,
    trustLevel: s.trust.level,
  })
}

const isOneOk = (p: SpendPreview) => p.path === "vote" && p.tier === "one_ok"

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
      const trustAfter = settleTrust(s.trust, s.amount)
      const levelUp = trustAfter.level > s.trust.level ? trustAfter.level : null
      const spend: Spend = { amount: s.amount, reason: s.reason, preview, usedBefore: s.used, trustAfter, levelUp }
      return { ...s, phase: { tag: "checking", spend }, seq: s.seq + 1, closing: null }
    }
    case "checked":
      if (s.phase.tag !== "checking") return s
      return { ...s, phase: { tag: s.phase.spend.preview.path === "instant" ? "approved" : "asked", spend: s.phase.spend } }
    case "shown": {
      if (s.phase.tag !== "approved") return s
      const { amount, trustAfter } = s.phase.spend
      if (amount > s.balance) return s // never below $0.00
      return { ...s, balance: s.balance - amount, used: s.used + amount, trust: trustAfter, phase: { tag: "sent", spend: s.phase.spend } }
    }
    case "approveAsLeo": {
      // one OK or the group's second approval: paid, and it counts toward trust, but not toward the $200 (D-07)
      if (s.phase.tag !== "asked") return s
      const { amount, trustAfter } = s.phase.spend
      if (amount > s.balance) return s
      return { ...s, balance: s.balance - amount, trust: trustAfter, phase: { tag: "leoApproved", spend: s.phase.spend } }
    }
  }
}

// ---------------------------------------------------------------------------------------------------------
// Copy

/** The preview sentence (title + why) in the Spend sheet's own words (RulePreview previewCopy), for this Pot. */
const copyOf = (p: SpendPreview, balance: Micro, used: Micro) => previewCopy(p, { rules: RULES, balance }, used)

/** Why a spend needs someone's OK, in the rules' words ("It's over your $100 instant limit."). */
function whyAsked(spend: Spend): string {
  return copyOf(spend.preview, 0n, spend.usedBefore)[1] ?? ""
}

/** The one line when a paid spend raises Maya's trust. */
const trustLine = (level: number) => t("home.try.trust", { amount: whole(limitAt(level)) })

const sentences = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(" ")

/** The one sentence the live region speaks for each outcome (and nothing in between). */
function liveSentence(phase: Phase): string {
  if (phase.tag === "idle" || phase.tag === "checking" || phase.tag === "approved") return ""
  const { spend } = phase
  const amount = whole(spend.amount)
  const trust = spend.levelUp !== null ? trustLine(spend.levelUp) : null
  if (phase.tag === "sent") return sentences(`${t("spend.approved")}.`, `${t("spend.sent", { amount })}.`, trust)
  if (phase.tag === "asked") {
    if (isOneOk(spend.preview)) {
      const [waiting, who] = tLines("approve.ok.own")
      return sentences(`${tLines("spend.one_ok_sent")[0]}.`, whyAsked(spend), `${waiting}.`, who)
    }
    return sentences(`${tLines("spend.vote_sent", { k: K, n: N })[0]}.`, whyAsked(spend), t("approve.own.counted", { remaining: K - 1 }))
  }
  if (isOneOk(spend.preview)) {
    const [approved, paid] = tLines("approve.decided.ok", { okName: LEO.name, amount, name: MAYA.name })
    return sentences(`${approved}.`, paid, trust)
  }
  return sentences(t("approve.final", { amount, name: MAYA.name }), trust)
}

/** The rules that decide a spend: who approves it, and the per-person total when that's why it isn't instant. */
function rulesOf(p: SpendPreview): RuleId[] {
  if (p.path === "instant") return ["instant"]
  if (p.path !== "vote") return []
  const who: RuleId = p.tier === "one_ok" ? "oneok" : "group"
  return p.reason === "over_budget" ? [who, "person"] : [who]
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
    if ((tag === "sent" || tag === "leoApproved") && !prefersReducedMotion()) once(balanceRef.current, [{ opacity: 0 }, { opacity: 1 }], 200)
  }, [s.balance, tag])

  const preview = previewFor(s)
  const busy = isBusy(phase)
  const canSpend = !busy && (preview.path === "instant" || preview.path === "vote")
  const dirty = s.balance !== START_BALANCE || s.used !== 0n || tag !== "idle"
  /** the result the stage shows (or is closing); null = the preview */
  const result: Outcome | null = tag !== "idle" ? phase : s.closing
  const highlight = tag !== "idle" ? rulesOf(phase.spend.preview) : rulesOf(preview)

  // the action button: [Spend $84], or Leo's while Maya waits ([OK $300 as Leo] for one OK, [Approve as Leo] for the group)
  const job = tag === "asked" ? "approve" : "spend"
  const leoLabel =
    phase.tag === "asked" && isOneOk(phase.spend.preview) ? t("home.try.ok.cta", { amount: whole(phase.spend.amount) }) : t("home.try.leo.cta")
  const guardUntil = useRef(0)
  const blocked = job === "spend" && !canSpend

  const onAction = () => {
    if (Date.now() < guardUntil.current) return // the second tap of a double tap on Leo's button
    if (job === "spend") return dispatch({ type: "spend" })
    guardUntil.current = Date.now() + GUARD_MS
    // Leo's OK or approval: if the same amount can't be spent next, focus never stays on a "no" button: it moves to
    // the result (no scroll: the visitor is already looking at it)
    const paid = phase.tag === "asked" ? phase.spend : null
    const next = previewFor({ amount: s.amount, balance: s.balance - (paid?.amount ?? 0n), used: s.used, trust: paid?.trustAfter ?? s.trust })
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
              <ResultRows key={roadOf(result.spend.preview)} result={result} closing={tag === "idle"} balance={s.balance} leoId={leoId} />
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
                    {leoLabel}
                  </span>
                ) : (
                  <span key="spend" className={cn(tag === "leoApproved" && "play-label")}>
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

/** instant · one OK · the group: a new road mounts its own result rows (the same road keeps them) */
const roadOf = (p: SpendPreview) => (p.path === "instant" ? "instant" : isOneOk(p) ? "one_ok" : "group")

/** A one-off Web Animation on ease-standard (where the API exists). */
function once(el: Element | null | undefined, keyframes: Keyframe[], ms: number) {
  if (el && typeof el.animate === "function") el.animate(keyframes, { duration: ms, easing: "cubic-bezier(0.2, 0, 0, 1)" })
}

function RuleList({ highlight, used }: { highlight: RuleId[]; used: Micro }) {
  // "You've used $84 of it." appears when the money moves (a timer), so its line is always there, invisible until
  // then: the card below never moves (on phones the list sits above it)
  const usedLine = t("rules.budget.used", { used: whole(used > 0n ? used : dollars(84)) })
  // the app's Rules tab order (components/pot/Tabs.tsx): instant → one OK → the group → per person
  const rows = [
    { id: "instant", Icon: Zap, text: t("rules.instant", { instantLimit: INSTANT_LIMIT }), sub: null },
    { id: "oneok", Icon: Hand, text: t("rules.one_ok", { oneOk: ONE_OK_LIMIT }), sub: null },
    { id: "group", Icon: Users, text: t("rules.threshold", { k: K, n: N }), sub: null },
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
        {rows.map(({ id, Icon, text, sub }) => {
          const active = highlight.includes(id)
          return (
            <li
              key={id}
              data-rule={id}
              data-active={active || undefined}
              className={cn(
                "flex items-start gap-3 rounded-md px-3 py-2 transition-colors duration-200 ease-standard motion-reduce:transition-none",
                active && "bg-surface dark:ring-1 dark:ring-line",
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
          )
        })}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------------
// The stage's capsule: the one box that is the preview and then the rules' answer. Every sentence it can show for
// this spend is stacked in it (Layers), so it never changes height on a timer.

/** Every preview this Pot can show (instant · one OK, over the limit or over the $200 · the group · over the balance). */
const KINDS = ["instant", "one_ok:over_cap", "one_ok:over_budget", "group", "balance"] as const
type PreviewKind = (typeof KINDS)[number]
type CapsuleLayer = `p:${PreviewKind}` | "sizer" | "checking" | "rules" | "asked" | "decided"

function kindOf(p: SpendPreview): PreviewKind {
  if (p.path === "instant") return "instant"
  if (p.path !== "vote") return "balance"
  if (p.tier !== "one_ok") return "group"
  return p.reason === "over_budget" ? "one_ok:over_budget" : "one_ok:over_cap"
}

/** One preview of each kind for Maya's current limit; the live preview stands in for its own kind, word for word. */
function previewSamples(live: SpendPreview): Record<PreviewKind, SpendPreview> {
  const base = { k: K, n: N, effectiveCap: live.effectiveCap }
  return {
    instant: { ...base, path: "instant", reason: "ok", tier: "instant" },
    "one_ok:over_cap": { ...base, path: "vote", reason: "over_cap", tier: "one_ok" },
    "one_ok:over_budget": { ...base, path: "vote", reason: "over_budget", tier: "one_ok" },
    group: { ...base, path: "vote", reason: "over_cap", tier: "group" },
    balance: { ...base, path: "blocked", reason: "balance" },
    [kindOf(live)]: live,
  }
}

/** The Spend sheet's decision icons (RulePreview): a check, the one-OK hand, the group's clock, the balance's x. */
const PREVIEW_ICON: Record<PreviewKind, ReactNode> = {
  instant: <Check aria-hidden className="size-5 text-approved" strokeWidth={2} />,
  "one_ok:over_cap": <Hand aria-hidden className="size-5 text-waiting" strokeWidth={2} />,
  "one_ok:over_budget": <Hand aria-hidden className="size-5 text-waiting" strokeWidth={2} />,
  group: <Clock aria-hidden className="size-5 text-waiting" strokeWidth={2} />,
  balance: <X aria-hidden className="size-5 text-declined" strokeWidth={2} />,
}

function capsuleLayerOf(result: Outcome | null, preview: SpendPreview): CapsuleLayer {
  if (!result) return `p:${kindOf(preview)}`
  if (result.tag === "checking") return "checking"
  if (result.tag === "approved" || result.tag === "sent") return "rules"
  return result.tag === "asked" ? "asked" : "decided"
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
  const samples = previewSamples(preview)
  const pv = (kind: PreviewKind): Layer => {
    const [title, body] = copyOf(samples[kind], balance, used)
    const key = `p:${kind}` as const
    return { id: key, node: <Lines id={described === key ? previewId : undefined} title={title} body={body} /> }
  }
  // the longest preview (one OK over the $200, with a 3-digit total), so the box is as tall as it will ever need to be
  const [sizerTitle, sizerBody] = copyOf(samples["one_ok:over_budget"], balance, dollars(188))
  const text: Layer[] = [...KINDS.map(pv), { id: "sizer", node: <Lines title={sizerTitle} body={sizerBody} /> }]
  const icons: Layer[] = KINDS.map((kind) => ({ id: `p:${kind}`, node: PREVIEW_ICON[kind] }))
  if (spend) {
    const amount = whole(spend.amount)
    text.push({ id: "checking", enter: true, node: <Lines title={t("spend.checking")} /> })
    icons.push({ id: "checking", enter: true, node: <TypingDots key={seq} size="sm" className="text-ink-muted" /> })
    if (spend.preview.path === "instant") {
      text.push({ id: "rules", node: <Lines title={t("spend.approved")} body={t("feed.instant.rule", { instantLimit: INSTANT_LIMIT })} /> })
      icons.push({ id: "rules", node: <Check aria-hidden className="play-pop size-5 text-approved" strokeWidth={2} /> })
    } else {
      const oneOk = isOneOk(spend.preview)
      // one OK: the Spend sheet's "Sent · One OK from anyone else…", then the request's "Approved by Leo's OK · …";
      // the group: "Sent to the group" + why, then the approver's "Approved! … is on its way"
      const [asked, askedBody]: [string, string | null] = oneOk
        ? tLines("spend.one_ok_sent")
        : [tLines("spend.vote_sent", { k: K, n: N })[0], whyAsked(spend)]
      const [decided, decidedBody]: [string, string | null] = oneOk
        ? tLines("approve.decided.ok", { okName: LEO.name, amount, name: MAYA.name })
        : [t("approve.final", { amount, name: MAYA.name }), null]
      text.push({ id: "asked", node: <Lines title={asked} body={askedBody} /> }, { id: "decided", node: <Lines title={decided} body={decidedBody} /> })
      icons.push(
        {
          id: "asked",
          node: oneOk ? (
            <Hand aria-hidden className="play-pop size-5 text-waiting" strokeWidth={2} />
          ) : (
            <Clock aria-hidden className="play-pop size-5 text-waiting" strokeWidth={2} />
          ),
        },
        { id: "decided", node: <Check aria-hidden className="play-pop size-5 text-approved" strokeWidth={2} /> },
      )
    }
  }
  return (
    <div
      ref={ref}
      tabIndex={-1}
      data-capsule
      data-rule-preview={preview.path}
      data-tier={preview.tier}
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
// The result's rows under the capsule: what the money is doing, who approved (one OK or the group), the trust line
// when this spend raises Maya's limit, and the Pot's balance. Each row stacks this road's states.

function ResultRows({ result, closing, balance, leoId }: { result: Outcome; closing: boolean; balance: Micro; leoId: string }) {
  const { tag, spend } = result
  const instant = spend.preview.path === "instant"
  const oneOk = isOneOk(spend.preview)
  const amount = whole(spend.amount)
  const paid = tag === "sent" || tag === "leoApproved"
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
            {/* the app's request chips: "Needs one OK" (Feed, RequestCard), or the group's count */}
            <StatusChip status="needs" className="play-pop play-pop-chip tabular-nums">
              {oneOk ? t("feed.pending.one_ok") : t("approve.progress", { count: 1, k: K })}
            </StatusChip>
          </Row>
        ),
      },
      {
        id: "leoApproved",
        node: (
          <Row>
            <p className="min-w-0 text-body-sm text-ink-muted">{reasonLabel(spend.reason)}</p>
            <StatusChip status="approved" className="play-pop play-pop-chip tabular-nums">
              {oneOk ? t("row.status.one_ok") : t("approve.progress", { count: K, k: K })}
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
          <span className="min-w-0">{oneOk ? t("home.try.ok.hint") : t("home.try.leo.hint")}</span>
        </p>
      ),
    },
    {
      id: "leoApproved",
      node: oneOk ? (
        // the request's timeline line (ApproveSheet): "Leo · gave the OK"
        <p className="flex items-start gap-2 text-body-sm text-pretty text-ink-muted">
          <Avatar person={LEO} size="xs" />
          <span className="min-w-0">{t("approve.timeline.ok", { name: LEO.name })}</span>
        </p>
      ) : (
        <p className="flex items-start gap-2 text-body-sm text-pretty text-ink-muted">
          <AvatarStack people={[MAYA, LEO]} size="xs" ring="surface" />
          <span className="min-w-0">{t("feed.approved.sub", { names: t("feed.and", { a: MAYA.name, b: LEO.name }) })}</span>
        </p>
      ),
    },
  ]
  return (
    <div
      data-closing={closing || undefined}
      aria-hidden={closing || undefined}
      inert={closing}
      className="play-rows mt-3 flex flex-col gap-2 px-1"
      data-try-result={tag}
    >
      {/* the status row for this moment ("approved" and "sent" are their own rows on the instant road) */}
      <Layers on={tag} layers={status} />
      {!instant && <Layers on={tag === "asked" || tag === "leoApproved" ? tag : null} layers={who} />}
      {/* Trust grows: the spend that raises Maya's limit says so once it's paid (its space is kept from the tap) */}
      {spend.levelUp !== null && (
        <Layers
          on={paid ? "trust" : null}
          layers={[
            {
              id: "trust",
              node: (
                <p className="flex items-start gap-2 text-body-sm text-pretty text-ink tabular-nums" data-try-trust>
                  <Sprout aria-hidden className="mt-0.5 size-4 shrink-0 text-ink" strokeWidth={2} />
                  <span className="min-w-0">{trustLine(spend.levelUp)}</span>
                </p>
              ),
            },
          ]}
        />
      )}
      {/* the money moving, where the visitor is looking: the one roll of a spend */}
      <p className="mt-1 flex items-baseline justify-between gap-3 border-t border-line pt-3" data-try-stage-balance>
        <span className="text-body-sm text-ink-muted">{t("pot.hero.label")}</span>
        <LiveMoney micro={balance} roll={!closing && paid} ghost="end" variant="title" className="text-ink" />
      </p>
    </div>
  )
}

function Row({ children }: { children: ReactNode }) {
  return <div className="flex min-h-7 flex-wrap items-center justify-between gap-x-3 gap-y-1">{children}</div>
}
