"use client"
// Create Pot (ux-spec §4.12, design-direction 01 §3, frontend-architecture §5.10): a Pot in under a minute.
// Step 1 name + emoji + colour with a live preview of what friends see; step 2 "Pot rules": every editable rule
// is a sentence with an inline amount (instant limit, per-person limit), who instant payments can go to (members,
// or members + up to 10 named people), the optional "$X each", and the fixed rules as plain lines. No templates:
// the Pot is created with preset "custom" and exactly these rules. Step 3 progress ("Free: we cover the setup")
// → the Share sheet.
// Step 2 is its own history entry (?step=rules), so the browser's Back and the in-sheet [Back] both return to
// step 1 with everything typed kept (notes/frontend.md "Back in multi-step sheets").
// The invite keypair is generated here, so the first link exists the moment the Pot does (7 days, 10 uses).
import { Check, CircleAlert, Hourglass, Info, Lock, Plus, Undo2, UserPlus, Users, UserRound, UserCheck, X, Zap } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useReducer, useState, type Dispatch } from "react"
import { toast } from "sonner"
import { ProgressSteps } from "@/components/feedback/States"
import { COVER_GRADIENTS, CoverTile } from "@/components/pot/CoverTile"
import { Button } from "@/components/ui/button"
import { Sheet, SheetBack } from "@/components/sheets/Sheet"
import { t } from "@/i18n/t"
import { useOnline } from "@/lib/client/browser"
import { createReducer, initialCreate, NAME_MAX, type CreateEvent, type CreateState } from "@/lib/client/machines/create"
import { checkRulesForm, FIXED, INSTANT_MAX, MAX_NAMED, parseAmount, PERSON_MAX, type RulesCheck } from "@/lib/client/create-rules"
import { sdkConfig } from "@/lib/client/config"
import { generateInvite } from "@/lib/client/invite"
import { createPot } from "@/lib/client/actions"
import { ActionError } from "@/lib/client/errors"
import { formatUsd, toCents } from "@/lib/client/money"
import { cn } from "@/lib/client/cn"
import { pushSheetStep, sheetStepBack, useSheetParams } from "@/lib/client/sheet"

const EMOJI = ["✈️", "🇵🇹", "🏖️", "🏔️", "🍷", "🎉", "🏕️", "🚐", "🎿", "🍕", "⚽", "🎸"]

export function CreatePotSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter()
  const online = useOnline()
  const [s, dispatch] = useReducer(createReducer, initialCreate)
  const status = s.status
  // the step in the URL: Back (the browser's or ours) pops ?step=rules and the reducer follows
  const { params } = useSheetParams()
  const urlStep = params.get("step") === "rules" ? 2 : 1
  const [seenStep, setSeenStep] = useState(urlStep)
  if (seenStep !== urlStep) {
    setSeenStep(urlStep)
    if (open && urlStep === 1 && s.step === 2) dispatch({ type: "BACK" })
    if (open && urlStep === 2 && s.step === 1) dispatch({ type: "NEXT" }) // the browser's Forward
  }
  const next = () => {
    const to = createReducer(s, { type: "NEXT" })
    dispatch({ type: "NEXT" })
    if (to.step === 2 && urlStep !== 2) pushSheetStep((p) => p.set("step", "rules"))
  }
  const back = () => {
    if (urlStep === 2) sheetStepBack((p) => p.delete("step"))
    else dispatch({ type: "BACK" })
  }
  useEffect(() => {
    if (status !== "creating") return
    const id = setTimeout(() => dispatch({ type: "SLOW" }), 8000)
    return () => clearTimeout(id)
  }, [status])

  const close = () => {
    if (s.status === "creating") return
    dispatch({ type: "RESET" })
    setTouched(new Set())
    onClose()
  }
  const cfg = sdkConfig()
  const check = checkRulesForm(s.rules, { hubId: cfg.hubId, usdcId: cfg.usdcId })
  const goal = parseAmount(s.goalText)
  const goalError = s.goalOn && (goal === null || goal <= 0n)
  // fields people have left (errors show once a field was left, or after [Create Pot])
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set())
  const touch = (id: string) => setTouched((x) => (x.has(id) ? x : new Set(x).add(id)))
  const show = (id: string) => s.attempted || touched.has(id)

  const create = async () => {
    if (!online) return toast(t("add.offline"))
    if (!check.rules || goalError) {
      dispatch({ type: "ATTEMPT" })
      // move to the first thing to fix
      requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-create-rules] [aria-invalid='true']")?.focus())
      return
    }
    const rules = check.rules
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
      })
      dispatch({ type: "CREATED", slug })
      toast.success(t("create.success", { potName: s.name.trim() }))
      dispatch({ type: "RESET" })
      setTouched(new Set())
      router.replace(`/p/${slug}?sheet=share`)
    } catch (e) {
      dispatch({ type: "FAILED", key: e instanceof ActionError && e.reason === "ERR_CREATOR_DAILY_LIMIT" ? "create.error.limit" : "create.error.relayer" })
    }
  }

  const title = s.step === 1 ? t("create.step1.title") : s.step === 2 ? t("create.step2.title") : t("create.progress", { potName: s.name.trim() }).split(" · ")[0]!
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
        s.step === 1 ? (
          <Button variant="primary" className="w-full" onClick={next}>
            {t("create.cta.next")}
          </Button>
        ) : s.step === 2 ? (
          <div className="flex flex-col gap-2">
            {s.error && (
              <p role="alert" className="text-body-sm text-ink">
                {t(s.error)}
              </p>
            )}
            {s.attempted && (!check.ok || goalError) && (
              <p role="alert" className="flex items-start gap-2 text-body-sm text-ink" data-create-fix>
                <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-declined" strokeWidth={2} />
                {t("create.rules.fix")}
              </p>
            )}
            <Button variant="primary" className="w-full" onClick={create} aria-disabled={!online || undefined}>
              {t("create.cta")}
            </Button>
            <SheetBack onClick={back} />
          </div>
        ) : null
      }
    >
      <div className="flex flex-col gap-5 pt-1">
        {s.step < 3 && <p className="text-body-sm text-ink-muted">{t("create.step_of", { step: s.step, total: 2 })}</p>}

        {s.step === 1 && (
          <>
            <figure className="flex flex-col gap-2">
              <div className="flex items-center gap-3 rounded-lg bg-surface p-3 shadow-card ring-1 ring-line">
                <CoverTile emoji={s.emoji} cover={s.cover} size="lg" />
                <div className="min-w-0">
                  <p className={cn("truncate font-display text-heading", s.name.trim() ? "text-ink" : "text-ink-muted")}>{nameShown}</p>
                  <p className="text-body-sm text-ink-muted">{t("create.preview.members")}</p>
                </div>
              </div>
              <figcaption className="text-body-sm text-ink-muted">{t("create.preview_hint")}</figcaption>
            </figure>

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
                  if (e.key === "Enter") next()
                }}
                className="h-13 rounded-sm border border-line-strong bg-surface-sunken px-3 text-body text-ink placeholder:text-ink-muted"
              />
              {s.nameError && (
                <span id="name-error" className="text-body-sm text-ink">
                  {t("create.error.name")}
                </span>
              )}
            </label>

            <fieldset>
              <legend className="mb-2 text-label text-ink">{t("create.cover")}</legend>
              <div role="radiogroup" aria-label={t("create.cover")} className="grid grid-cols-6 gap-2">
                {EMOJI.map((e) => (
                  <button
                    key={e}
                    type="button"
                    role="radio"
                    aria-checked={s.emoji === e}
                    aria-label={e}
                    onClick={() => dispatch({ type: "EMOJI", value: e })}
                    className={cn(
                      "grid aspect-square min-h-11 place-items-center rounded-md text-2xl",
                      s.emoji === e ? "bg-brand-soft ring-2 ring-ink" : "bg-surface-sunken hover:bg-line",
                    )}
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
                    aria-checked={s.cover === i}
                    aria-label={t("create.cover.swatch", { n: i + 1 })}
                    onClick={() => dispatch({ type: "COVER", value: i })}
                    className="grid size-11 place-items-center rounded-pill"
                  >
                    <span className={cn("grid size-9 place-items-center rounded-pill bg-linear-to-br", g, s.cover === i && "ring-2 ring-ink ring-offset-2 ring-offset-surface")}>
                      {s.cover === i && <Check aria-hidden className="size-4 text-on-brand" strokeWidth={3} />}
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>
          </>
        )}

        {s.step === 2 && (
          <RulesStep s={s} check={check} goalError={goalError} show={show} touch={touch} dispatch={dispatch} />
        )}

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
}: {
  id: string
  value: string
  label: string
  invalid: boolean
  describedBy?: string
  onChange: (v: string) => void
  onBlur: () => void
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
          "h-11 w-28 rounded-sm border bg-surface-sunken pr-3 pl-7 text-body font-semibold text-ink tabular-nums",
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
  goalError,
  show,
  touch,
  dispatch,
}: {
  s: CreateState
  check: RulesCheck
  goalError: boolean
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

      <div className="flex flex-col gap-2 rounded-md border border-line-strong p-4" data-rule="goal">
        <div className="flex items-center justify-between gap-3">
          <span className="text-label text-ink" id="goal-label">
            {t("create.goal.label")}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={s.goalOn}
            aria-labelledby="goal-label"
            onClick={() => dispatch({ type: "GOAL", on: !s.goalOn })}
            className="grid h-11 w-14 shrink-0 place-items-center"
          >
            <span className={cn("relative h-7 w-12 rounded-pill transition-colors duration-200", s.goalOn ? "bg-ink" : "bg-line-strong")}>
              <span
                className={cn(
                  "absolute top-0.5 left-0.5 size-6 rounded-pill bg-surface shadow transition-transform duration-200 motion-reduce:transition-none",
                  s.goalOn && "translate-x-5",
                )}
              />
            </span>
          </button>
        </div>
        {s.goalOn && (
          <>
            <p className="flex flex-wrap items-center gap-2 text-body text-ink">
              <AmountField
                id="goal-amount"
                value={s.goalText}
                label={t("create.goal.amount.label")}
                invalid={goalError && show("goal")}
                describedBy={goalError && show("goal") ? "goal-note" : undefined}
                onChange={(v) => dispatch({ type: "GOAL_AMOUNT", value: v })}
                onBlur={() => touch("goal")}
              />
              <span>{t("create.goal.each.after")}</span>
            </p>
            {goalError && show("goal") && (
              <FieldNote id="goal-note" kind="error">
                {t("create.goal.amount.invalid")}
              </FieldNote>
            )}
          </>
        )}
      </div>

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
