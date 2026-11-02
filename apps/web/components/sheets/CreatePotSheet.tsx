"use client"
// Create Pot (ux-spec §4.12, design-direction 01 §3, frontend-architecture §5.10): a Pot in under a minute.
// Lean create (notes/gifts-plan.md "Lean create flow", 2026-11-02): ONE screen. The cover preview (tap it for a
// small emoji + colour picker), the name, "Everyone chips in $150 each" inline (amount editable, switch off), one
// rules summary line ("Small spends up to $100 go through on their own; bigger ones go to the group · [Change]")
// and [Create Pot], the one marigold. Default path: Start a Pot → name → Create Pot, no scrolling at 390×844.
// [Change] opens the full "Pot rules" step unchanged: every editable rule is a sentence with an inline amount
// (instant limit, per-person limit), who instant payments can go to (members, or members + up to 10 named
// people), trust, one OK, the goal with a date, and the fixed rules as plain lines. It is its own history entry
// (?step=rules), so the browser's Back and the in-sheet [Back] both return to the main screen with everything
// kept (notes/frontend.md "Back in multi-step sheets"); it can create the Pot too. No templates: the Pot is created
// with preset "custom" and exactly these rules. Step 3 progress ("Free: we cover the setup") → the Share sheet.
// The invite keypair is generated here, so the first link exists the moment the Pot does (7 days, 10 uses).
import { Check, CircleAlert, Flag, Hand, Hourglass, Info, Lock, Pencil, Plus, Sprout, Undo2, UserPlus, Users, UserRound, UserCheck, X, Zap } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useReducer, useRef, useState, type Dispatch } from "react"
import { toast } from "sonner"
import { ProgressSteps } from "@/components/feedback/States"
import { COVER_GRADIENTS, CoverTile } from "@/components/pot/CoverTile"
import { Button } from "@/components/ui/button"
import { Sheet, SheetBack } from "@/components/sheets/Sheet"
import { t } from "@/i18n/t"
import { useOnline } from "@/lib/client/browser"
import { createReducer, initialCreate, NAME_MAX, validateName, type CreateEvent, type CreateState } from "@/lib/client/machines/create"
import { checkRulesForm, FIXED, INSTANT_MAX, MAX_NAMED, parseAmount, PERSON_MAX, type RulesCheck } from "@/lib/client/create-rules"
import { sdkConfig } from "@/lib/client/config"
import { generateInvite } from "@/lib/client/invite"
import { createPot } from "@/lib/client/actions"
import { ActionError } from "@/lib/client/errors"
import { formatUsd, toCents } from "@/lib/client/money"
import { cn } from "@/lib/client/cn"
import { pushSheetStep, sheetStepBack, useSheetParams } from "@/lib/client/sheet"
import { checkExtrasForm, defaultGoalDate, isoDay, type ExtrasCheck } from "@/lib/client/wave4-form"
import { useNow } from "@/lib/client/time"

const EMOJI = ["✈️", "🇵🇹", "🏖️", "🏔️", "🍷", "🎉", "🏕️", "🚐", "🎿", "🍕", "⚽", "🎸"]

/** What to focus once a field to fix is on screen (after [Create Pot] with something wrong). */
const FOCUS = { name: "[data-create-name]", each: "#goal-amount", rules: "[data-create-rules] [aria-invalid='true']" } as const
const focusSoon = (selector: string) => requestAnimationFrame(() => document.querySelector<HTMLElement>(selector)?.focus())

export function CreatePotSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter()
  const online = useOnline()
  // the rules step in the URL: Back (the browser's or ours) pops ?step=rules and the reducer follows; a cold deep
  // link to ?sheet=create&step=rules starts there
  const { params } = useSheetParams()
  const urlStep = params.get("step") === "rules" ? 2 : 1
  const [s, dispatch] = useReducer(createReducer, urlStep, (u): CreateState => (u === 2 ? { ...initialCreate, step: 2 } : initialCreate))
  const status = s.status
  const [seenStep, setSeenStep] = useState(urlStep)
  if (seenStep !== urlStep) {
    setSeenStep(urlStep)
    if (open && urlStep === 1 && s.step === 2) dispatch({ type: "BACK" })
    if (open && urlStep === 2 && s.step === 1) dispatch({ type: "RULES" }) // the browser's Forward
  }
  const openRules = () => {
    dispatch({ type: "RULES" })
    if (urlStep !== 2) pushSheetStep((p) => p.set("step", "rules"))
  }
  const back = () => {
    if (urlStep === 2) sheetStepBack((p) => p.delete("step"))
    else dispatch({ type: "BACK" })
  }
  // a field to fix on the other screen: focus it once that screen is in (after the Sheet focused its heading)
  const focusAfter = useRef<string | null>(null)
  useEffect(() => {
    const target = focusAfter.current
    if (!target) return
    focusAfter.current = null
    focusSoon(target)
  }, [s.step])
  useEffect(() => {
    if (status !== "creating") return
    const id = setTimeout(() => dispatch({ type: "SLOW" }), 8000)
    return () => clearTimeout(id)
  }, [status])
  // the emoji + colour picker behind the cover preview
  const [picker, setPicker] = useState(false)
  const coverRef = useRef<HTMLButtonElement>(null)

  const close = () => {
    if (s.status === "creating") return
    dispatch({ type: "RESET" })
    setTouched(new Set())
    setPicker(false)
    onClose()
  }
  const cfg = sdkConfig()
  const check = checkRulesForm(s.rules, { hubId: cfg.hubId, usdcId: cfg.usdcId })
  const goal = parseAmount(s.goalText)
  // hub 1.1.0 extras (trust, one OK, the goal with a date): checked against the instant limit and today
  const now = useNow()
  const extrasCheck = checkExtrasForm(s.extras, check.instant, now)
  // "$X each" lives on the main screen; everything else on the rules step
  const eachError = s.goalOn && (goal === null || goal <= 0n)
  const rulesOk = !!check.rules && !!extrasCheck.extras
  // fields people have left (errors show once a field was left, or after [Create Pot])
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set())
  const touch = (id: string) => setTouched((x) => (x.has(id) ? x : new Set(x).add(id)))
  const show = (id: string) => s.attempted || touched.has(id)

  const create = async () => {
    if (!online) return toast(t("add.offline"))
    const nameOk = validateName(s.name)
    if (!nameOk || eachError || !rulesOk) {
      dispatch({ type: "ATTEMPT" })
      // fix what's on this screen first, then move to the other one
      const main = !nameOk || eachError
      const to = s.step === 2 ? (rulesOk ? 1 : 2) : main ? 1 : 2
      const target = to === 2 ? FOCUS.rules : !nameOk ? FOCUS.name : FOCUS.each
      if (to === s.step) focusSoon(target)
      else {
        focusAfter.current = target
        if (to === 2) openRules()
        else back()
      }
      return
    }
    const rules = check.rules!
    dispatch({ type: "SUBMIT" })
    try {
      const invite = await generateInvite()
      const slug = await createPot({
        name: s.name.trim(),
        emoji: s.emoji,
        cover: s.cover,
        goalEachCents: s.goalOn && goal ? toCents(goal) : null,
        rules,
        invite,
        extras: extrasCheck.extras!,
      })
      dispatch({ type: "CREATED", slug })
      toast.success(t("create.success", { potName: s.name.trim() }))
      dispatch({ type: "RESET" })
      setTouched(new Set())
      setPicker(false)
      router.replace(`/p/${slug}?sheet=share`)
    } catch (e) {
      dispatch({ type: "FAILED", key: e instanceof ActionError && e.reason === "ERR_CREATOR_DAILY_LIMIT" ? "create.error.limit" : "create.error.relayer" })
    }
  }

  const title = s.step === 1 ? t("create.title") : s.step === 2 ? t("create.step2.title") : t("create.progress", { potName: s.name.trim() }).split(" · ")[0]!
  const nameShown = s.name.trim() || t("create.name.placeholder")
  return (
    <Sheet
      open={open}
      onClose={close}
      title={title}
      full
      keyboard
      stepKey={s.step}
      footer={
        // one keyed list for both screens: [Create Pot] stays the same element across them, so focus is never lost
        s.step < 3 ? (
          <div className="flex flex-col gap-2">
            {s.error && (
              <p key="error" role="alert" className="text-body-sm text-ink">
                {t(s.error)}
              </p>
            )}
            {s.step === 2 && s.attempted && !rulesOk && (
              <p key="fix" role="alert" className="flex items-start gap-2 text-body-sm text-ink" data-create-fix>
                <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-declined" strokeWidth={2} />
                {t("create.rules.fix")}
              </p>
            )}
            <Button key="create" variant="primary" className="w-full" onClick={create} aria-disabled={!online || undefined}>
              {t("create.cta")}
            </Button>
            {s.step === 2 && <SheetBack key="back" onClick={back} />}
          </div>
        ) : null
      }
    >
      <div className="flex flex-col gap-5 pt-1">
        {s.step === 1 && (
          <>
            <figure className="flex flex-col gap-2">
              <div className="flex items-center gap-3 rounded-lg bg-surface p-3 shadow-card ring-1 ring-line">
                <button
                  ref={coverRef}
                  type="button"
                  aria-label={t("create.cover.edit")}
                  aria-expanded={picker}
                  aria-controls={picker ? "create-picker" : undefined}
                  onClick={() => setPicker((v) => !v)}
                  className="relative shrink-0 rounded-md"
                  data-cover-edit
                >
                  <CoverTile emoji={s.emoji} cover={s.cover} size="lg" />
                  <span aria-hidden className="absolute -right-1.5 -bottom-1.5 grid size-6 place-items-center rounded-pill bg-surface text-ink shadow-card ring-1 ring-line-strong">
                    <Pencil className="size-3.5" strokeWidth={2} />
                  </span>
                </button>
                <div className="min-w-0">
                  <p className={cn("truncate font-display text-heading", s.name.trim() ? "text-ink" : "text-ink-muted")}>{nameShown}</p>
                  <p className="text-body-sm text-ink-muted">{t("create.preview.members")}</p>
                </div>
              </div>
              <figcaption className="text-body-sm text-ink-muted">
                {t("create.preview_hint")} {t("create.cover.hint")}
              </figcaption>
            </figure>

            {picker && (
              <CoverPicker
                emoji={s.emoji}
                cover={s.cover}
                dispatch={dispatch}
                onDone={() => {
                  setPicker(false)
                  coverRef.current?.focus()
                }}
              />
            )}

            <label className="flex flex-col gap-1.5">
              <span className="flex items-center justify-between text-label text-ink">
                {t("create.name.label")}
                <span className="text-body-sm font-normal text-ink-muted">{t("create.name.count", { count: s.name.length })}</span>
              </span>
              <input
                value={s.name}
                maxLength={NAME_MAX}
                enterKeyHint="done"
                autoComplete="off"
                aria-invalid={s.nameError || undefined}
                aria-describedby={s.nameError ? "name-error" : undefined}
                placeholder={t("create.name.placeholder")}
                onChange={(e) => dispatch({ type: "NAME", value: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void create()
                }}
                data-create-name
                className="h-13 rounded-sm border border-line-strong bg-surface-sunken px-3 text-body text-ink placeholder:text-ink-muted"
              />
              {s.nameError && (
                <span id="name-error" className="flex items-start gap-1.5 text-body-sm text-ink">
                  <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-declined" strokeWidth={2} />
                  {t("create.error.name")}
                </span>
              )}
            </label>

            <div className="flex flex-col divide-y divide-line rounded-md border border-line-strong">
              <EachRow s={s} error={eachError && show("goal")} dispatch={dispatch} touch={() => touch("goal")} />
              <RulesSummary check={check} ok={rulesOk} onChange={openRules} />
            </div>
          </>
        )}

        {s.step === 2 && <RulesStep s={s} check={check} extrasCheck={extrasCheck} show={show} touch={touch} dispatch={dispatch} />}

        {s.step === 3 && (
          <div className="flex flex-col gap-6 pt-4" aria-busy="true">
            <div className="flex items-center gap-3">
              <CoverTile emoji={s.emoji} cover={s.cover} size="lg" />
              <p className="font-display text-heading text-ink">{s.name.trim()}</p>
            </div>
            <ProgressSteps
              steps={[
                {
                  label: t("create.progress", { potName: s.name.trim() }).split(" · ")[0]!,
                  helper: s.slow ? t("create.slow") : t("create.progress", { potName: s.name.trim() }).split(" · ")[1],
                  state: s.slug ? "done" : "current",
                },
                { label: t("create.progress.ready"), state: s.slug ? "current" : "next" },
              ]}
            />
          </div>
        )}
      </div>
    </Sheet>
  )
}

// ------------------------------------------------------------------------------------------------- main screen

/** The small picker behind the cover preview: 12 emoji and 6 colours, closed with [Done]. */
function CoverPicker({ emoji, cover, dispatch, onDone }: { emoji: string; cover: number; dispatch: Dispatch<CreateEvent>; onDone: () => void }) {
  return (
    <div id="create-picker" className="flex flex-col gap-4 rounded-md bg-surface-sunken p-3" data-cover-picker>
      <fieldset>
        <legend className="mb-2 text-label text-ink">{t("create.cover")}</legend>
        <div role="radiogroup" aria-label={t("create.cover")} className="grid grid-cols-6 gap-2">
          {EMOJI.map((e) => (
            <button
              key={e}
              type="button"
              role="radio"
              aria-checked={emoji === e}
              aria-label={e}
              onClick={() => dispatch({ type: "EMOJI", value: e })}
              className={cn("grid aspect-square min-h-11 place-items-center rounded-md text-2xl", emoji === e ? "bg-brand-soft ring-2 ring-ink" : "bg-surface hover:bg-line")}
            >
              {e}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-label text-ink">{t("create.cover.color")}</legend>
        <div role="radiogroup" aria-label={t("create.cover.color")} className="flex flex-wrap gap-2">
          {COVER_GRADIENTS.map((g, i) => (
            <button
              key={g}
              type="button"
              role="radio"
              aria-checked={cover === i}
              aria-label={t("create.cover.swatch", { n: i + 1 })}
              onClick={() => dispatch({ type: "COVER", value: i })}
              className="grid size-11 place-items-center rounded-pill"
            >
              <span className={cn("grid size-9 place-items-center rounded-pill bg-linear-to-br", g, cover === i && "ring-2 ring-ink ring-offset-2 ring-offset-surface-sunken")}>
                {cover === i && <Check aria-hidden className="size-4 text-on-brand" strokeWidth={3} />}
              </span>
            </button>
          ))}
        </div>
      </fieldset>
      <Button variant="ghost" size="sm" className="self-end" onClick={onDone} data-cover-done>
        {t("create.cover.done")}
      </Button>
    </div>
  )
}

/** "Everyone chips in $[150] each" with its switch (on by default; off = no per-person amount). */
function EachRow({ s, error, dispatch, touch }: { s: CreateState; error: boolean; dispatch: Dispatch<CreateEvent>; touch: () => void }) {
  return (
    <div className="flex flex-col px-3 py-1.5" data-create-each>
      <div className="flex items-center gap-2">
        <p className={cn("flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-1 text-body", s.goalOn ? "text-ink" : "text-ink-muted")}>
          <span>{t("create.goal.inline")}</span>
          {s.goalOn && (
            <>
              <AmountField
                id="goal-amount"
                value={s.goalText}
                label={t("create.goal.amount.label")}
                invalid={error}
                describedBy={error ? "goal-note" : undefined}
                onChange={(v) => dispatch({ type: "GOAL_AMOUNT", value: v })}
                onBlur={touch}
                narrow
              />
              <span>{t("create.goal.each.after")}</span>
            </>
          )}
        </p>
        <Toggle label={t("create.goal.label")} on={s.goalOn} onChange={(on) => dispatch({ type: "GOAL", on })} />
      </div>
      {error && (
        <FieldNote id="goal-note" kind="error">
          {t("create.goal.amount.invalid")}
        </FieldNote>
      )}
    </div>
  )
}

/** The one rules line: what happens to a spend, and [Change] → the full rules (?step=rules). */
function RulesSummary({ check, ok, onChange }: { check: RulesCheck; ok: boolean; onChange: () => void }) {
  const instant = check.instant
  const text = !ok ? t("create.summary.fix") : instant === 0n ? t("create.summary.zero") : t("create.summary.instant", { instantLimit: whole(instant ?? 0n) })
  return (
    <div className="flex items-center gap-2 px-3 py-3" data-create-summary={ok ? "ok" : "fix"}>
      {!ok && <CircleAlert aria-hidden className="size-5 shrink-0 text-declined" strokeWidth={2} />}
      <p id="rules-summary" className="min-w-0 flex-1 text-body text-ink tabular-nums">
        {text}
      </p>
      <Button variant="secondary" size="sm" className="px-3" aria-label={t("create.summary.change.label")} aria-describedby="rules-summary" onClick={onChange} data-rules-change>
        {t("create.summary.change")}
      </Button>
    </div>
  )
}

// ------------------------------------------------------------------------------------------------- step 2

const whole = (m: bigint) => formatUsd(m, "whole")

/** An inline "$ [100]" field inside a rule sentence: 16 px (no iOS zoom), tabular figures, decimal keyboard. */
function AmountField({
  id,
  value,
  label,
  invalid,
  describedBy,
  onChange,
  onBlur,
  narrow,
}: {
  id: string
  value: string
  label: string
  invalid: boolean
  describedBy?: string
  onChange: (v: string) => void
  onBlur: () => void
  /** inline in a one-line row (the main screen's "$150 each") */
  narrow?: boolean
}) {
  return (
    <span className="relative inline-flex shrink-0">
      <span aria-hidden className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-body font-semibold text-ink">
        {t("create.rules.dollar")}
      </span>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        enterKeyHint="done"
        autoComplete="off"
        value={value}
        aria-label={label}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        data-money-input
        className={cn(
          "h-11 rounded-sm border bg-surface-sunken pr-3 pl-7 text-body font-semibold text-ink tabular-nums",
          narrow ? "w-22" : "w-28",
          invalid ? "border-declined" : "border-line-strong",
        )}
      />
    </span>
  )
}

function FieldNote({ id, kind, children }: { id: string; kind: "error" | "info"; children: string }) {
  const Icon = kind === "error" ? CircleAlert : Info
  return (
    <p id={id} className={cn("mt-2 flex items-start gap-1.5 text-body-sm", kind === "error" ? "text-ink" : "text-ink-muted")} data-field-note={kind}>
      <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", kind === "error" ? "text-declined" : "text-ink-muted")} strokeWidth={2} />
      {children}
    </p>
  )
}

function amountMessage(err: RulesCheck["instantError"], instant: bigint | null): string {
  switch (err) {
    case "create.rules.instant.max":
      return t("create.rules.instant.max", { max: whole(INSTANT_MAX) })
    case "create.rules.person.max":
      return t("create.rules.person.max", { max: whole(PERSON_MAX) })
    case "create.rules.person.below":
      return t("create.rules.person.below", { instantLimit: whole(instant ?? 0n) })
    default:
      return t("create.rules.amount.invalid")
  }
}

function RulesStep({
  s,
  check,
  extrasCheck,
  show,
  touch,
  dispatch,
}: {
  s: CreateState
  check: RulesCheck
  extrasCheck: ExtrasCheck
  show: (id: string) => boolean
  touch: (id: string) => void
  dispatch: Dispatch<CreateEvent>
}) {
  const r = s.rules
  // a wrong amount shows once the field was left; "less than the instant limit" shows at once (it explains itself)
  const instantErr = check.instantError && show("instant") ? check.instantError : null
  const personErr = check.personError && (show("perPerson") || check.personError === "create.rules.person.below") ? check.personError : null
  const zero = check.instant === 0n && !check.instantError
  const named = r.payees === "members_and_allowlist"
  const fixed = [
    { icon: Users, text: t("create.rules.fixed.majority") },
    { icon: Undo2, text: t("create.rules.fixed.leftovers") },
    { icon: Hourglass, text: t("create.rules.fixed.expiry", { days: FIXED.expiryDays }) },
    { icon: UserPlus, text: t("create.rules.fixed.size", { max: FIXED.maxMembers }) },
  ]
  return (
    <div className="flex flex-col gap-4" data-create-rules>
      <p className="text-body text-ink-muted">{t("create.rules.intro")}</p>

      <div className="flex gap-3 rounded-md border border-line-strong p-4" data-rule="instant">
        <Zap aria-hidden className="mt-2.5 size-6 shrink-0 text-ink" strokeWidth={2} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body text-ink">
            <span>{t("create.rules.instant.before")}</span>
            <AmountField
              id="rule-instant"
              value={r.instant}
              label={t("create.rules.instant.label")}
              invalid={!!instantErr}
              describedBy={instantErr ? "rule-instant-note" : zero ? "rule-instant-zero" : undefined}
              onChange={(v) => dispatch({ type: "RULE_AMOUNT", field: "instant", value: v })}
              onBlur={() => touch("instant")}
            />
            <span>{t("create.rules.instant.after")}</span>
          </p>
          {instantErr ? (
            <FieldNote id="rule-instant-note" kind="error">
              {amountMessage(instantErr, check.instant)}
            </FieldNote>
          ) : (
            zero && (
              <FieldNote id="rule-instant-zero" kind="info">
                {t("create.rules.instant.zero")}
              </FieldNote>
            )
          )}
        </div>
      </div>

      <div className="flex gap-3 rounded-md border border-line-strong p-4" data-rule="perPerson">
        <UserRound aria-hidden className="mt-2.5 size-6 shrink-0 text-ink" strokeWidth={2} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body text-ink">
            <span>{t("create.rules.person.before")}</span>
            <AmountField
              id="rule-person"
              value={r.perPerson}
              label={t("create.rules.person.label")}
              invalid={!!personErr}
              describedBy={personErr ? "rule-person-note" : undefined}
              onChange={(v) => dispatch({ type: "RULE_AMOUNT", field: "perPerson", value: v })}
              onBlur={() => touch("perPerson")}
            />
            <span>{t("create.rules.person.after")}</span>
          </p>
          {personErr && (
            <FieldNote id="rule-person-note" kind="error">
              {amountMessage(personErr, check.instant)}
            </FieldNote>
          )}
        </div>
      </div>

      <ExtrasRules s={s} check={check} x={extrasCheck} show={show} touch={touch} dispatch={dispatch} />

      <fieldset className="rounded-md border border-line-strong p-4" data-rule="payees">
        <legend className="float-left mb-1 flex w-full items-start gap-3 text-body text-ink">
          <UserCheck aria-hidden className="mt-0.5 size-6 shrink-0" strokeWidth={2} />
          {t("create.rules.payees.legend")}
        </legend>
        <div className="clear-both min-w-0 pl-9">
          <div className="flex flex-col">
            {(
              [
                ["members", "create.rules.payees.members"],
                ["members_and_allowlist", "create.rules.payees.named"],
              ] as const
            ).map(([value, key]) => (
              <label key={value} className="flex min-h-11 cursor-pointer items-center gap-3 text-body text-ink">
                <input
                  type="radio"
                  name="create-payees"
                  value={value}
                  checked={r.payees === value}
                  onChange={() => dispatch({ type: "PAYEES", value })}
                  className="size-5 shrink-0 accent-ink"
                />
                {t(key)}
              </label>
            ))}
          </div>
          {named && (
            <div className="mt-2 flex flex-col gap-2" data-named>
              <p id="named-hint" className="text-body-sm text-ink-muted">
                {t("create.rules.named.hint", { max: MAX_NAMED })}
              </p>
              {r.named.map((v, i) => {
                const err = check.namedErrors[i] && show(`named-${i}`) ? check.namedErrors[i] : null
                const emptyErr = check.namedEmpty && s.attempted && i === 0
                const noteId = `named-${i}-note`
                return (
                  <div key={i} className="flex flex-col">
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={v}
                        maxLength={64}
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        autoComplete="off"
                        enterKeyHint="done"
                        aria-label={t("create.rules.named.label", { n: i + 1 })}
                        aria-invalid={!!err || emptyErr || undefined}
                        aria-describedby={err || emptyErr ? `${noteId} named-hint` : "named-hint"}
                        placeholder={t("create.rules.named.placeholder")}
                        onChange={(e) => dispatch({ type: "NAMED", index: i, value: e.target.value })}
                        onBlur={() => touch(`named-${i}`)}
                        data-named-input={i}
                        className={cn(
                          "h-12 min-w-0 flex-1 rounded-sm border bg-surface-sunken px-3 text-body text-ink placeholder:text-ink-muted",
                          err || emptyErr ? "border-declined" : "border-line-strong",
                        )}
                      />
                      {(r.named.length > 1 || v !== "") && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-11 shrink-0"
                          aria-label={t("create.rules.named.remove", { n: i + 1 })}
                          onClick={() => dispatch({ type: "NAMED_REMOVE", index: i })}
                        >
                          <X aria-hidden className="size-5" strokeWidth={2} />
                        </Button>
                      )}
                    </div>
                    {err ? (
                      <FieldNote id={noteId} kind="error">
                        {t(err)}
                      </FieldNote>
                    ) : (
                      emptyErr && (
                        <FieldNote id={noteId} kind="error">
                          {t("create.rules.named.empty")}
                        </FieldNote>
                      )
                    )}
                  </div>
                )
              })}
              {r.named.length < MAX_NAMED ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="self-start"
                  // keep focus in the field being typed until the new one exists: its blur error would otherwise
                  // push this button down between press and release, and the tap would miss
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    const n = r.named.length
                    dispatch({ type: "NAMED_ADD" })
                    requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`[data-named-input="${n}"]`)?.focus())
                  }}
                  data-named-add
                >
                  <Plus aria-hidden className="size-4" strokeWidth={2} />
                  {t("create.rules.named.add")}
                </Button>
              ) : (
                <p className="text-body-sm text-ink-muted" data-named-limit>
                  {t("create.rules.named.limit", { max: MAX_NAMED })}
                </p>
              )}
            </div>
          )}
        </div>
      </fieldset>

      <GoalRule s={s} x={extrasCheck} show={show} touch={touch} dispatch={dispatch} />

      <section aria-labelledby="fixed-h" className="rounded-md bg-surface-sunken p-4" data-rules-fixed>
        <h3 id="fixed-h" className="flex items-center gap-2 text-label text-ink">
          <Lock aria-hidden className="size-4 shrink-0" strokeWidth={2} />
          {t("create.rules.fixed.title")}
        </h3>
        <ul className="mt-2 flex flex-col gap-2">
          {fixed.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-3 text-body text-ink">
              <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-muted" strokeWidth={2} />
              {text}
            </li>
          ))}
        </ul>
      </section>

      <p className="text-body-sm text-ink-muted" data-rules-footer>
        {t("create.rules.footer")}
      </p>
    </div>
  )
}

// ------------------------------------------------------------------------------------------------- hub 1.1.0

/** A labelled switch (the same look as "Everyone chips in"): ink when on, never marigold. */
function Toggle({
  id,
  label,
  on,
  onChange,
  describedBy,
}: {
  /** the id of the visible label, or `label` for a switch whose sentence is its label */
  id?: string
  label?: string
  on: boolean
  onChange: (on: boolean) => void
  describedBy?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-labelledby={id}
      aria-label={id ? undefined : label}
      aria-describedby={describedBy}
      onClick={() => onChange(!on)}
      className="grid h-11 w-14 shrink-0 place-items-center"
    >
      <span className={cn("relative h-7 w-12 rounded-pill transition-colors duration-200", on ? "bg-ink" : "bg-line-strong")}>
        <span className={cn("absolute top-0.5 left-0.5 size-6 rounded-pill bg-surface shadow transition-transform duration-200 motion-reduce:transition-none", on && "translate-x-5")} />
      </span>
    </button>
  )
}

/** "Trust grows" (default on) and "Spends up to $300 need just one OK from anyone else" (follows 3 × the instant limit). */
function ExtrasRules({
  s,
  check,
  x,
  show,
  touch,
  dispatch,
}: {
  s: CreateState
  check: RulesCheck
  x: ExtrasCheck
  show: (id: string) => boolean
  touch: (id: string) => void
  dispatch: Dispatch<CreateEvent>
}) {
  const f = s.extras
  const instant = check.instant ?? 0n
  const oneOkErr = x.oneOkError && (show("oneOk") || x.oneOkError === "create.oneok.below") ? x.oneOkError : null
  return (
    <>
      <div className="flex gap-3 rounded-md border border-line-strong p-4" data-rule="trust">
        <Sprout aria-hidden className="mt-2.5 size-6 shrink-0 text-ink" strokeWidth={2} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <span id="trust-label" className="text-label text-ink">
              {t("create.trust.label")}
            </span>
            <Toggle id="trust-label" on={f.trust} describedBy="trust-hint" onChange={(on) => dispatch({ type: "EXTRAS", e: { type: "TRUST", on } })} />
          </div>
          <p id="trust-hint" className="text-body text-ink">
            {t("create.trust.hint")}
          </p>
          {f.trust && instant > 0n && (
            <p className="mt-1 text-body-sm text-ink-muted tabular-nums">
              {t("create.trust.detail", { step: 3, instantLimit: whole(instant), max: whole(instant * 3n) })}
            </p>
          )}
        </div>
      </div>

      <div className="flex gap-3 rounded-md border border-line-strong p-4" data-rule="oneOk">
        <Hand aria-hidden className="mt-2.5 size-6 shrink-0 text-ink" strokeWidth={2} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body text-ink">
            <span>{t("create.oneok.before")}</span>
            <AmountField
              id="rule-oneok"
              value={f.oneOk}
              label={t("create.oneok.label")}
              invalid={!!oneOkErr}
              describedBy={oneOkErr ? "rule-oneok-note" : "rule-oneok-hint"}
              onChange={(v) => dispatch({ type: "EXTRAS", e: { type: "ONE_OK", value: v } })}
              onBlur={() => touch("oneOk")}
            />
            <span>{t("create.oneok.after")}</span>
          </p>
          {oneOkErr ? (
            <FieldNote id="rule-oneok-note" kind="error">
              {oneOkErr === "create.oneok.below" ? t("create.oneok.below", { instantLimit: whole(instant) }) : t("create.rules.amount.invalid")}
            </FieldNote>
          ) : (
            <FieldNote id="rule-oneok-hint" kind="info">
              {t("create.oneok.hint")}
            </FieldNote>
          )}
        </div>
      </div>
    </>
  )
}

/** "Set a goal": Collect $[1,200] by [date] + "All or nothing" (a missed goal refunds everyone automatically). */
function GoalRule({
  s,
  x,
  show,
  touch,
  dispatch,
}: {
  s: CreateState
  x: ExtrasCheck
  show: (id: string) => boolean
  touch: (id: string) => void
  dispatch: Dispatch<CreateEvent>
}) {
  const f = s.extras
  const now = useNow()
  const amountErr = x.goalAmountError && show("target") ? x.goalAmountError : null
  const dateErr = x.goalDateError && (show("targetDate") || s.attempted) ? x.goalDateError : null
  return (
    <div className="flex flex-col gap-2 rounded-md border border-line-strong p-4" data-rule="target">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-3 text-label text-ink" id="target-label">
          <Flag aria-hidden className="size-6 shrink-0" strokeWidth={2} />
          {t("create.target.label")}
        </span>
        <Toggle id="target-label" on={f.goalOn} onChange={(on) => dispatch({ type: "EXTRAS", e: { type: "GOAL_ON", on, defaultDate: defaultGoalDate(now) } })} />
      </div>
      {f.goalOn && (
        <>
          <p className="flex flex-wrap items-center gap-2 text-body text-ink">
            <span>{t("create.target.before")}</span>
            <AmountField
              id="target-amount"
              value={f.goal}
              label={t("create.target.amount.label")}
              invalid={!!amountErr}
              describedBy={amountErr ? "target-amount-note" : undefined}
              onChange={(v) => dispatch({ type: "EXTRAS", e: { type: "GOAL", value: v } })}
              onBlur={() => touch("target")}
            />
            <span>{t("create.target.by")}</span>
            <input
              type="date"
              aria-label={t("create.target.date.label")}
              aria-invalid={!!dateErr || undefined}
              aria-describedby={dateErr ? "target-date-note" : undefined}
              value={f.goalDate}
              min={isoDay(now, 1)}
              max={isoDay(now, 365)}
              onChange={(e) => dispatch({ type: "EXTRAS", e: { type: "GOAL_DATE", value: e.target.value } })}
              onBlur={() => touch("targetDate")}
              data-target-date
              className={cn("h-11 rounded-sm border bg-surface-sunken px-3 text-body text-ink tabular-nums", dateErr ? "border-declined" : "border-line-strong")}
            />
          </p>
          {amountErr && (
            <FieldNote id="target-amount-note" kind="error">
              {t(amountErr)}
            </FieldNote>
          )}
          {dateErr && (
            <FieldNote id="target-date-note" kind="error">
              {t(dateErr)}
            </FieldNote>
          )}
          <div className="mt-1 flex items-start justify-between gap-3 border-t border-line pt-3">
            <div className="min-w-0">
              <span id="aon-label" className="text-label text-ink">
                {t("create.target.aon.label")}
              </span>
              <p id="aon-hint" className="text-body-sm text-ink-muted">
                {t("create.target.aon.hint")}
              </p>
              {f.allOrNothing && <p className="mt-1 text-body-sm text-ink-muted">{t("create.target.aon.spend")}</p>}
            </div>
            <Toggle id="aon-label" on={f.allOrNothing} describedBy="aon-hint" onChange={(on) => dispatch({ type: "EXTRAS", e: { type: "AON", on } })} />
          </div>
        </>
      )}
    </div>
  )
}
