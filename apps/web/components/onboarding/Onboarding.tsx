"use client"
// First-run onboarding (2026-11-02; notes/frontend.md "Onboarding"): three short screens, then the optional "Help us
// make Pot better". A full-height sheet at ?sheet=intro (the shared Sheet: role dialog, focus on open, Esc and ✕,
// Back closes it), hosted once in the app shell, so it never appears on /demo, the landing, an invite before sign-in
// or the claim/gift pages.
//
// When (lib/client/onboarding.ts autoShow): once per browser for a signed-in person, never on top of another sheet.
//  - Creators from the landing's "Start a Pot" (/pots?sheet=create right after signing in): the intro comes first
//    and ends in the Create sheet (&then=create).
//  - Joiners: never before or during joining. "You're in!" → their Pot → the intro (after the Add money sheet, if they
//    took it), in words about THEIR Pot and its real rules, and it returns them to it.
//  - Anyone else: on the first app screen they land on.
// Screens (one idea each, a real fragment of the app rather than art; the fragments are examples, so they're hidden
// from screen readers and the sentence carries the meaning):
//   1. the money lives in the Pot with the group's rules (the rules as sentences + an instant row and a waiting row);
//   2. everyone sees where it goes, and everyone gets their share back at close (a row with its receipt + the refund);
//   3. free, demo dollars, nothing to set up.
// Then the survey (lib/survey.ts): 2-3 chip questions on one screen, all optional, one-line why + privacy note.
// Skip on every screen, progress dots (buttons) on the intro, swipe left/right on touch, one marigold per screen.
// The flag (localStorage pot.onboarding.v1) is set when it ends by any route: finished, Skip, ✕/Esc or Back.
// "See the intro again" (You → Help) opens the same sheet; a replay never touches the flag.
import { Check, Hand, Lock, UserRound, Users, X, Zap } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"
import { toast } from "sonner"
import { MoneyText } from "@/components/money/MoneyText"
import { Avatar } from "@/components/pot/Avatar"
import { CommentMark, CompactRow, LeadAvatar, ReceiptMark, RowTitle } from "@/components/pot/CompactRow"
import { Chip } from "@/components/pot/Controls"
import { StatusChip } from "@/components/pot/StatusChip"
import { Sheet } from "@/components/sheets/Sheet"
import { Button } from "@/components/ui/button"
import { t, type MessageKey } from "@/i18n/t"
import { cn } from "@/lib/client/cn"
import { useMe, usePot } from "@/lib/client/data"
import { PEOPLE } from "@/lib/client/mock/fixtures"
import { dollars, formatUsd, type Micro } from "@/lib/client/money"
import {
  autoShow,
  clearEntry,
  markOnboardingDone,
  noteOnboardingShown,
  onboardingDone,
  readEntry,
  useOnboardingState,
  type EntryContext,
  type OnboardingRecord,
} from "@/lib/client/onboarding"
import { approvalsNeeded, DEFAULT_RULES } from "@/lib/client/rules"
import { ONE_OK_MULT } from "@/lib/client/wave4-form"
import { closeSheet, openSheet, replaceSheet, replaceSheetParams, useSheetParams } from "@/lib/client/sheet"
import { loadMySurvey, sendSurvey } from "@/lib/client/survey"
import {
  hasAnswers,
  questionsFor,
  seededOrder,
  SURVEY_VERSION,
  type SurveyAnswers,
  type SurveyContext,
  type SurveyQuestion,
} from "@/lib/survey"

/** The page paints first; the intro follows a beat later (and only if nothing else opened meanwhile). */
export const AUTO_DELAY_MS = 450
const INTRO_STEPS = 3
const SWIPE_PX = 48

type Finish = (survey: OnboardingRecord["survey"], via: OnboardingRecord["via"]) => void

// ---------------------------------------------------------------------------------------------------------
// the host (app shell)

export function OnboardingHost() {
  const { sheet, params } = useSheetParams()
  const pathname = usePathname()
  const router = useRouter()
  const state = useOnboardingState()
  const open = sheet === "intro"
  /** this opening: the automatic first run (records the flag) or a replay from You */
  const run = useRef<"auto" | "replay" | null>(null)
  const [openings, setOpenings] = useState(0)
  const query = params.toString()

  // open by itself when it's due and nothing else is on screen
  useEffect(() => {
    const now = () => autoShow({ flag: state.flag, doneThisLoad: state.doneThisLoad, params: new URLSearchParams(window.location.search), pathname: window.location.pathname })
    const first = now()
    if (first !== "show" && first !== "intercept_create") return
    // "Start a Pot" right after a first sign-in: swap to the intro at once (Create is held closed meanwhile, see
    // PotsScreen), so the two never show together
    if (first === "intercept_create") {
      noteOnboardingShown()
      replaceSheetParams((p) => {
        p.set("sheet", "intro")
        p.set("then", "create")
      })
      return
    }
    const id = setTimeout(() => {
      const d = now() // re-check: a sheet may have opened in the meantime
      if (d === "show") {
        noteOnboardingShown()
        openSheet("intro")
      } else if (d === "intercept_create") {
        noteOnboardingShown()
        replaceSheetParams((p) => {
          p.set("sheet", "intro")
          p.set("then", "create")
        })
      }
    }, AUTO_DELAY_MS)
    return () => clearTimeout(id)
  }, [state, query, pathname])

  // each opening: auto or replay; closed by the browser's Back (the sheet left without finishing) = dismissed
  useEffect(() => {
    if (open && run.current === null) {
      run.current = onboardingDone() ? "replay" : "auto"
    } else if (!open && run.current !== null) {
      if (run.current === "auto" && !onboardingDone()) markOnboardingDone("skipped", "closed")
      run.current = null
    }
    // the next opening starts on screen 1 with a fresh form (after this one's exit transition)
    if (!open) {
      const id = setTimeout(() => setOpenings((n) => n + 1), 400)
      return () => clearTimeout(id)
    }
  }, [open])

  const finish: Finish = (survey, via) => {
    const auto = run.current === "auto" || (run.current === null && !onboardingDone())
    if (auto) markOnboardingDone(survey, via)
    run.current = null
    const entry = readEntry()
    if (auto) clearEntry()
    if (params.get("then") === "create") {
      replaceSheet("create")
      return
    }
    if (auto && entry?.how === "joined" && pathname !== `/p/${entry.slug}`) {
      router.replace(`/p/${entry.slug}`)
      return
    }
    closeSheet()
  }

  return <OnboardingSheet key={openings} open={open} onFinish={finish} thenCreate={params.get("then") === "create"} />
}

// ---------------------------------------------------------------------------------------------------------
// the sheet

export function OnboardingSheet({ open, onFinish, thenCreate = false }: { open: boolean; onFinish: Finish; thenCreate?: boolean }) {
  const me = useMe()
  // how they came in, read once as the sheet opens (a Pot created while the shell was already up counts too) and
  // kept through the exit transition; each opening is a fresh mount (the host keys it)
  const [entry, setEntry] = useState<EntryContext | null | undefined>(undefined)
  if (open && entry === undefined) setEntry(readEntry())
  const [step, setStep] = useState(0)
  const context: SurveyContext = entry?.how === "joined" ? "joined" : entry?.how === "created" || thenCreate ? "created" : "other"
  const joined = entry?.how === "joined" ? entry : null
  const survey = useSurveyForm(open, context)
  const touch = useRef<{ x: number; y: number } | null>(null)

  const go = (s: number) => setStep(Math.max(0, Math.min(INTRO_STEPS, s)))
  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.pointerType === "touch") touch.current = { x: e.clientX, y: e.clientY }
  }
  const onPointerUp = (e: ReactPointerEvent) => {
    const s = touch.current
    touch.current = null
    if (!s || step >= INTRO_STEPS) return
    const dx = e.clientX - s.x
    const dy = e.clientY - s.y
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return
    go(step + (dx < 0 ? 1 : -1))
  }

  const skip = (
    <Button variant="ghost" className="w-full" onClick={() => onFinish("skipped", "skipped")} aria-label={step < INTRO_STEPS ? t("onboarding.skip.a11y") : undefined} data-onboarding-skip>
      {step < INTRO_STEPS ? t("onboarding.skip") : t("survey.skip")}
    </Button>
  )
  const footer =
    step < INTRO_STEPS ? (
      <div className="flex flex-col gap-2">
        <Button variant="primary" className="w-full" onClick={() => go(step + 1)} data-onboarding-next>
          {step === INTRO_STEPS - 1 ? t("onboarding.continue") : t("onboarding.next")}
        </Button>
        {skip}
      </div>
    ) : (
      <div className="flex flex-col gap-2">
        <Button
          variant="primary"
          className="w-full"
          disabled={!hasAnswers(survey.answers) || survey.sending}
          onClick={async () => {
            if (await survey.send()) onFinish("sent", "finished")
          }}
          data-survey-send
        >
          {survey.sending ? t("survey.sending") : t("survey.send")}
        </Button>
        {skip}
      </div>
    )

  return (
    <Sheet
      open={open}
      onClose={() => onFinish("skipped", "closed")}
      title={t("onboarding.title")}
      full
      stepKey={step}
      header={<Progress step={step} onGo={go} />}
      footer={footer}
    >
      <div onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => (touch.current = null)} data-onboarding={step < INTRO_STEPS ? step + 1 : "survey"} data-onboarding-variant={joined ? "joined" : "creator"}>
        {step === 0 && <RulesStep joined={joined} />}
        {step === 1 && <SeeStep />}
        {step === 2 && <FreeStep />}
        {step === 3 && <SurveyStep form={survey} context={context} seed={me ?? "pot"} />}
      </div>
    </Sheet>
  )
}

/** The dots: one button per intro screen ("Screen 2 of 3"), the current one marked; on the survey, "Optional". */
function Progress({ step, onGo }: { step: number; onGo: (s: number) => void }) {
  if (step >= INTRO_STEPS)
    return (
      <span className="inline-flex h-7 items-center rounded-pill bg-surface-sunken px-2.5 text-body-sm font-semibold text-ink-muted" data-survey-optional>
        {t("survey.optional")}
      </span>
    )
  return (
    <ol aria-label={t("onboarding.progress.label")} className="-ml-1.5 flex items-center" data-onboarding-dots>
      {Array.from({ length: INTRO_STEPS }, (_, i) => {
        const on = i === step
        return (
          <li key={i}>
            <button
              type="button"
              onClick={() => onGo(i)}
              aria-current={on ? "step" : undefined}
              aria-label={t("onboarding.progress.step", { n: i + 1, total: INTRO_STEPS })}
              className="grid size-7 place-items-center rounded-pill"
            >
              <span aria-hidden className={cn("block h-2 rounded-pill transition-[width,background-color] duration-200 ease-standard motion-reduce:transition-none", on ? "w-5 bg-ink" : "w-2 bg-line-strong")} />
            </button>
          </li>
        )
      })}
    </ol>
  )
}

function StepFrame({ id, title, body, children, name }: { id: string; title: string; body: string; children?: ReactNode; name: string }) {
  return (
    <section aria-labelledby={id} className="pot-enter flex flex-col gap-4 pt-1" data-onboarding-step={name}>
      <div className="flex flex-col gap-2">
        <h3 id={id} data-step-heading tabIndex={-1} className="font-display text-title text-balance text-ink outline-none">
          {title}
        </h3>
        <p className="text-body text-ink-muted">{body}</p>
      </div>
      {children}
    </section>
  )
}

/** An example built from the app's own parts. Decorative: the step's sentence says it. */
function Example({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div aria-hidden inert className={cn("rounded-lg bg-surface-sunken p-3", className)} data-onboarding-example>
      {children}
    </div>
  )
}

const CAST = (["maya", "sam", "leo"] as const).map((id, i) => ({ id, name: PEOPLE[id].name, initials: PEOPLE[id].name.slice(0, 1), joinIndex: i, avatar: null }))
const [MAYA, SAM, LEO] = CAST as [(typeof CAST)[number], (typeof CAST)[number], (typeof CAST)[number]]

// 1 ------------------------------------------------------------------------------------------------------

/** The rules screen 1 shows: a new Pot's (what Create starts with: $100 without asking, one OK from anyone else up
 *  to 3 × that, the group's majority above it) or the joiner's own Pot's. `oneOkCap` 0 = no one-OK step. */
interface RulesView {
  instantCap: Micro
  oneOkCap: Micro
  k: number
  n: number
}
const NEW_POT: RulesView = { instantCap: DEFAULT_RULES.instantCap, oneOkCap: DEFAULT_RULES.instantCap * ONE_OK_MULT, k: approvalsNeeded(3), n: 3 }
/** The example's bigger spend: Sam's $300 boat trip. */
const BOAT = dollars(300)

function RulesStep({ joined }: { joined: EntryContext | null }) {
  const id = useId()
  return (
    <StepFrame
      id={id}
      name="rules"
      title={joined ? t("onboarding.rules.title_joined", { potName: joined.potName }) : t("onboarding.rules.title")}
      body={joined ? t("onboarding.rules.body_joined") : t("onboarding.rules.body")}
    >
      {joined ? <JoinedRules slug={joined.slug} /> : <RulesShown view={NEW_POT} />}
    </StepFrame>
  )
}

/** The joiner's own Pot rules (a new Pot's until it loads). */
function JoinedRules({ slug }: { slug: string }) {
  const pot = usePot(slug)
  const p = pot.state === "ready" ? pot.data : null
  return <RulesShown view={p ? { instantCap: p.rules.instantCap, oneOkCap: p.extras?.oneOkCap ?? 0n, k: p.k, n: p.n } : NEW_POT} />
}

/** The rules as sentences, then the example rows by the same rules: the $84 goes through on its own, and the $300
 *  boat trip waits for one OK ("Needs one OK", the request card's chip), or for the group where one OK doesn't reach. */
function RulesShown({ view }: { view: RulesView }) {
  const oneOk = view.oneOkCap >= BOAT
  return (
    <>
      <RulesLines view={view} />
      <Example>
        <ul className="flex flex-col gap-2">
          <CompactRow
            ground="surface"
            lead={<LeadAvatar person={MAYA} />}
            title={<RowTitle who={MAYA.name} what={t("onboarding.rules.example.instant")} />}
            amount={<MoneyText micro={dollars(84)} sign="out" className="text-ink" />}
            meta={<StatusChip status="instant" size="sm" ground="surface" />}
          />
          <CompactRow
            ground="surface"
            lead={<LeadAvatar person={SAM} />}
            title={<RowTitle who={SAM.name} what={t("onboarding.rules.example.group")} />}
            amount={<MoneyText micro={BOAT} sign="out" className="text-ink" />}
            meta={
              <StatusChip status="needs" size="sm">
                {oneOk ? t("feed.pending.one_ok") : t("approve.progress", { count: 1, k: view.k })}
              </StatusChip>
            }
          />
        </ul>
      </Example>
    </>
  )
}

/** The rules as the app says them (the Rules tab's sentences, in its order): what goes through on its own, then what
 *  needs one OK (or, with no one-OK step, what needs the group). Real text, read by screen readers. */
function RulesLines({ view }: { view: RulesView }) {
  const { instantCap, oneOkCap, k, n } = view
  const rows: [typeof Zap, string][] = [
    [Zap, t("rules.instant", { instantLimit: formatUsd(instantCap, "whole") })],
    oneOkCap > 0n ? [Hand, t("rules.one_ok", { oneOk: formatUsd(oneOkCap, "whole") })] : [n > 1 ? Users : UserRound, t("rules.threshold", { k, n })],
  ]
  return (
    <ul className="flex flex-col rounded-lg bg-surface-sunken px-3 py-1" data-onboarding-rules>
      {rows.map(([Icon, text]) => (
        <li key={text} className="flex items-start gap-3 border-b border-line py-2.5 text-body text-ink tabular-nums last:border-b-0">
          <Icon aria-hidden className="mt-0.5 size-5 shrink-0" strokeWidth={2} />
          <span className="min-w-0">{text}</span>
        </li>
      ))}
    </ul>
  )
}

// 2 ------------------------------------------------------------------------------------------------------

function SeeStep() {
  const id = useId()
  return (
    <StepFrame id={id} name="see" title={t("onboarding.see.title")} body={t("onboarding.see.body")}>
      <Example className="flex flex-col gap-3">
        <ul>
          <CompactRow
            lead={<LeadAvatar person={MAYA} />}
            title={<RowTitle who={MAYA.name} what={t("onboarding.rules.example.instant")} />}
            amount={<MoneyText micro={dollars(84)} sign="out" className="text-ink" />}
            meta={
              <>
                <StatusChip status="approved" size="sm" />
                <ReceiptMark />
                <CommentMark n={2} />
              </>
            }
          />
        </ul>
        <div className="rounded-md bg-surface p-3">
          <p className="text-label text-ink">{t("onboarding.see.closes")}</p>
          <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-2 text-body-sm">
            <span className="text-ink-muted">{t("close.table.person")}</span>
            <span className="text-right text-ink-muted">{t("close.table.put_in")}</span>
            <span className="text-right text-ink-muted">{t("close.table.gets_back")}</span>
            {[MAYA, SAM, LEO].map((p) => (
              <Refund key={p.id} person={p} />
            ))}
          </div>
        </div>
      </Example>
    </StepFrame>
  )
}

function Refund({ person }: { person: (typeof CAST)[number] }) {
  return (
    <>
      <span className="flex min-w-0 items-center gap-2">
        <Avatar person={person} size="xs" />
        <span className="truncate text-body text-ink">{person.name}</span>
      </span>
      <MoneyText micro={dollars(150)} className="text-right text-body text-ink-muted" />
      <MoneyText micro={dollars(22)} className="text-right text-body font-bold text-ink" />
    </>
  )
}

// 3 ------------------------------------------------------------------------------------------------------

const FREE_POINTS: MessageKey[] = ["onboarding.free.point.free", "onboarding.free.point.test", "onboarding.free.point.setup"]

function FreeStep() {
  const id = useId()
  return (
    <StepFrame id={id} name="free" title={t("onboarding.free.title")} body={t("onboarding.free.body")}>
      <ul className="flex flex-col rounded-lg bg-surface-sunken px-3 py-1" data-onboarding-points>
        {FREE_POINTS.map((k) => (
          <li key={k} className="flex items-start gap-3 border-b border-line py-3 text-body text-ink last:border-b-0">
            <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-pill bg-surface">
              <Check className="size-4 text-approved" strokeWidth={2.5} />
            </span>
            <span className="min-w-0">{t(k as "onboarding.free.point.free")}</span>
          </li>
        ))}
      </ul>
    </StepFrame>
  )
}

// survey -------------------------------------------------------------------------------------------------

interface SurveyForm {
  answers: SurveyAnswers
  set: (a: SurveyAnswers) => void
  prefilled: boolean
  sending: boolean
  error: boolean
  send: () => Promise<boolean>
}

function useSurveyForm(open: boolean, context: SurveyContext): SurveyForm {
  const [answers, setAnswers] = useState<SurveyAnswers>({})
  const [prefilled, setPrefilled] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(false)
  const touched = useRef(false)
  // a replay (or a second browser) starts from the earlier answers
  useEffect(() => {
    if (!open) return
    let live = true
    void loadMySurvey().then((s) => {
      if (!live || !s || touched.current || s.version !== SURVEY_VERSION || !hasAnswers(s.answers)) return
      setAnswers(s.answers)
      setPrefilled(true)
    })
    return () => {
      live = false
    }
  }, [open])
  const asked = useMemo(() => new Set(questionsFor(context).map((q) => q.id)), [context])
  return {
    answers,
    prefilled,
    sending,
    error,
    set: (a) => {
      touched.current = true
      setError(false)
      setAnswers(a)
    },
    send: async () => {
      const shown: SurveyAnswers = {}
      if (asked.has("use") && answers.use?.length) shown.use = answers.use
      if (asked.has("today") && answers.today) shown.today = answers.today
      if (asked.has("heard") && answers.heard) shown.heard = answers.heard
      if (!hasAnswers(shown)) return false
      setSending(true)
      setError(false)
      try {
        await sendSurvey({ version: SURVEY_VERSION, answers: shown, context })
        toast(t("survey.sent"))
        return true
      } catch {
        setError(true)
        return false
      } finally {
        setSending(false)
      }
    },
  }
}

function SurveyStep({ form, context, seed }: { form: SurveyForm; context: SurveyContext; seed: string }) {
  const id = useId()
  const questions = questionsFor(context)
  return (
    <section aria-labelledby={id} className="pot-enter flex flex-col gap-5 pt-1" data-onboarding-step="survey">
      <div className="flex flex-col gap-2">
        <h3 id={id} data-step-heading tabIndex={-1} className="font-display text-title text-balance text-ink outline-none">
          {t("survey.title")}
        </h3>
        <p className="text-body text-ink-muted">{t("survey.why", { n: questions.length })}</p>
        {form.prefilled && <p className="text-body-sm text-ink-muted" data-survey-prefilled>{t("survey.prefilled")}</p>}
      </div>
      {questions.map((q) => (
        <Question key={q.id} q={q} form={form} seed={seed} />
      ))}
      <p className="flex items-start gap-2 text-body-sm text-ink-muted" data-survey-privacy>
        <Lock aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
        <span>{t("survey.privacy")}</span>
      </p>
      {form.error && (
        <p role="alert" className="flex items-start gap-2 text-body-sm text-ink" data-survey-error>
          <X aria-hidden className="mt-0.5 size-4 shrink-0 text-declined" strokeWidth={2.5} />
          {t("survey.error")}
        </p>
      )}
    </section>
  )
}

const QUESTION_KEY: Record<SurveyQuestion["id"], "survey.q.use" | "survey.q.today" | "survey.q.heard"> = { use: "survey.q.use", today: "survey.q.today", heard: "survey.q.heard" }

function Question({ q, form, seed }: { q: SurveyQuestion; form: SurveyForm; seed: string }) {
  const id = useId()
  const options = q.shuffle ? seededOrder(q.options, seed) : [...q.options]
  const label = (o: string) => t(`survey.${q.id}.${o}` as "survey.use.trip")
  const isOn = (o: string) => (q.multi ? (form.answers.use ?? []).includes(o as never) : form.answers[q.id] === o)
  const toggle = (o: string) => {
    if (q.id === "use") {
      const cur = form.answers.use ?? []
      const next = cur.includes(o as never) ? cur.filter((x) => x !== o) : [...cur, o as never]
      form.set({ ...form.answers, use: next.length ? next : undefined })
    } else {
      form.set({ ...form.answers, [q.id]: form.answers[q.id] === o ? undefined : o })
    }
  }
  return (
    <div className="flex flex-col gap-2" data-survey-question={q.id}>
      <p id={id} className="text-label text-ink">
        {t(QUESTION_KEY[q.id])}
        <span className="block text-body-sm font-normal text-ink-muted">{q.multi ? t("survey.q.use.hint") : t("survey.pick_one")}</span>
      </p>
      <div role={q.multi ? "group" : "radiogroup"} aria-labelledby={id} className="flex flex-wrap gap-2">
        {options.map((o) => (
          <Chip key={o} selected={isOn(o)} onClick={() => toggle(o)} role={q.multi ? undefined : "radio"} className="h-auto min-h-12 py-2 text-left whitespace-normal">
            {label(o)}
          </Chip>
        ))}
      </div>
    </div>
  )
}
