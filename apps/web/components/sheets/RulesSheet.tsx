"use client"
// Change a rule (P-8, F-20; ux-spec §4.6; design-direction 02 §6b). One sheet (?sheet=rules), four faces:
//  - change: the two amounts that can change (instant limit, limit per person) as selectable cards edited with
//    the keypad (no sliders, WCAG 2.5.7), a live preview of the new sentences and "This needs 2 of 3 approvals",
//    then [Ask the group] → propose_rules + the asker's own approval (a 300 Tgas vote on its FunctionCall kind).
//    A sole member gets [Change rules] → set_rules, applied at once;
//  - review: what the group is approving, decoded from the proposal itself, the current sentence struck through
//    above the new one, the ApprovalTimeline, [Approve the change] / [Decline];
//  - waiting: your approval is counted, who is left;
//  - applied: the new rules apply to new spends from now on.
import { Check, Clock, X } from "lucide-react"
import { useReducer, useState } from "react"
import { Keypad } from "@/components/money/Keypad"
import { MoneyText } from "@/components/money/MoneyText"
import { Avatar } from "@/components/pot/Avatar"
import { inWords } from "@/components/pot/Feed"
import { ApprovalTimeline } from "@/components/pot/RequestCard"
import { ruleSentences } from "@/components/pot/Tabs"
import { Sheet } from "@/components/sheets/Sheet"
import { Button } from "@/components/ui/button"
import { t, type MessageKey } from "@/i18n/t"
import { proposeRules, setRules, voteRules } from "@/lib/client/actions"
import { announce, useOnline } from "@/lib/client/browser"
import { ActionError } from "@/lib/client/errors"
import type { PotVM, RulesChangeVM } from "@/lib/client/mock/types"
import { formatUsd, parseKeypad, toKeypad, type Micro } from "@/lib/client/money"
import type { Rules } from "@/lib/client/rules"
import { useNow } from "@/lib/client/time"
import { cn } from "@/lib/client/cn"

type Field = "instantCap" | "memberBudget"
type ErrKey = "rules.change.error" | "rules.change.in_flight" | "rules.change.closing" | "relayer.cap"
type Phase =
  | { tag: "idle" }
  | { tag: "busy"; what: "ask" | "approve" | "decline" }
  | { tag: "error"; key: ErrKey }
  | { tag: "sent"; remaining: number }
  | { tag: "applied"; key: "rules.change.applied" | "approve.rules.final"; title: string }
  | { tag: "declined" }
type Ev = { type: "set"; phase: Phase } | { type: "reset" }
const reducer = (_: Phase, e: Ev): Phase => (e.type === "reset" ? { tag: "idle" } : e.phase)

export function rulesErrorKey(e: unknown): ErrKey {
  const code = e instanceof ActionError ? e.reason : ""
  if (code === "ERR_RULES_PENDING") return "rules.change.in_flight"
  if (code === "ERR_POT_NOT_OPEN" || code === "pot_closed") return "rules.change.closing"
  if (e instanceof ActionError && e.cls === "rate_limited") return "relayer.cap"
  return "rules.change.error"
}

/** Which sentences changed between two rule sets (the review face strikes the old ones through). */
export function changedFields(from: Pick<Rules, Field>, to: Pick<Rules, Field>): Field[] {
  return (["instantCap", "memberBudget"] as const).filter((f) => from[f] !== to[f])
}

export function RulesSheet({ pot, open, onClose }: { pot: PotVM; open: boolean; onClose: () => void }) {
  const [phase, dispatch] = useReducer(reducer, { tag: "idle" })
  const change = pot.rulesChange && pot.rulesChange.status === "needs" ? pot.rulesChange : null
  const mode: "change" | "review" | "waiting" | "applied" =
    phase.tag === "applied"
      ? "applied"
      : phase.tag === "sent" || phase.tag === "declined" || (change && (change.mine || change.myVote !== null))
        ? "waiting"
        : change
          ? "review"
          : "change"
  const sole = pot.n === 1
  // the title stays put while the sheet moves to its result (the dialog keeps its name)
  const title =
    phase.tag === "applied"
      ? phase.title
      : (mode === "review" || (mode === "waiting" && !change?.mine && phase.tag !== "sent")) && change
        ? t("approve.rules.title", { name: change.proposer.name })
        : mode === "change" && sole
          ? t("rules.change.title.sole", { potName: pot.name })
          : t("rules.change.title")
  const close = () => {
    dispatch({ type: "reset" })
    onClose()
  }
  return (
    <Sheet open={open} onClose={close} title={title} label={title} footer={undefined}>
      {mode === "change" ? (
        <ChangeFace key={`${pot.rules.instantCap}-${pot.rules.memberBudget}`} pot={pot} phase={phase} dispatch={dispatch} />
      ) : mode === "review" && change ? (
        <ReviewFace pot={pot} change={change} phase={phase} dispatch={dispatch} />
      ) : (
        <ResultFace pot={pot} change={change} phase={phase} onDone={close} />
      )}
    </Sheet>
  )
}

function ChangeFace({ pot, phase, dispatch }: { pot: PotVM; phase: Phase; dispatch: (e: Ev) => void }) {
  const online = useOnline()
  const [values, setValues] = useState<Record<Field, Micro>>({ instantCap: pot.rules.instantCap, memberBudget: pot.rules.memberBudget })
  const [field, setField] = useState<Field>("instantCap")
  const [fresh, setFresh] = useState(true)
  const sole = pot.n === 1
  const changed = changedFields(pot.rules, values)
  const zero = values.instantCap <= 0n || values.memberBudget <= 0n
  const busy = phase.tag === "busy"
  const next: Rules = { ...pot.rules, ...values }
  const s = ruleSentences(next, pot.k, pot.n)
  const label = (f: Field) => t(f === "instantCap" ? "rules.change.instant.label" : "rules.change.budget.label")

  const submit = async () => {
    if (!online || busy || zero || changed.length === 0) return
    dispatch({ type: "set", phase: { tag: "busy", what: "ask" } })
    try {
      if (sole) {
        await setRules(pot, values)
        announce(t("rules.change.applied"))
        dispatch({ type: "set", phase: { tag: "applied", key: "rules.change.applied", title: t("rules.change.title.sole", { potName: pot.name }) } })
        return
      }
      const r = await proposeRules(pot, values)
      if (r.status === "approved") {
        announce(t("approve.rules.final"))
        dispatch({ type: "set", phase: { tag: "applied", key: "approve.rules.final", title: t("rules.change.title") } })
      } else {
        const remaining = Math.max(0, pot.k - 1)
        announce(t("rules.change.sent", { remaining }))
        dispatch({ type: "set", phase: { tag: "sent", remaining } })
      }
    } catch (e) {
      dispatch({ type: "set", phase: { tag: "error", key: rulesErrorKey(e) } })
    }
  }

  return (
    <div className="flex flex-col gap-4 pt-1" data-rules-sheet="change">
      <div role="radiogroup" aria-label={t("rules.change.title")} className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
        {(["instantCap", "memberBudget"] as const).map((f) => {
          const on = f === field
          return (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={t("rules.change.edit", { label: label(f), amount: formatUsd(values[f], "whole") })}
              onClick={() => {
                setField(f)
                setFresh(true)
              }}
              data-rules-field={f}
              className={cn(
                "flex min-h-24 flex-col items-start gap-1 rounded-md border p-3 text-left transition-[background-color,border-color] duration-120",
                on ? "border-brand-deep bg-brand-soft" : "border-line-strong bg-surface hover:bg-surface-sunken",
              )}
            >
              <span className="flex items-center gap-1.5 text-body-sm text-ink">
                {on && <Check aria-hidden className="size-4" strokeWidth={2.5} />}
                {label(f)}
              </span>
              <MoneyText micro={values[f]} variant="title" style="whole" className="text-ink" />
              {values[f] !== pot.rules[f] && (
                <span className="text-body-sm text-ink-muted">
                  <MoneyText micro={pot.rules[f]} variant="inline" style="whole" strike />
                </span>
              )}
            </button>
          )
        })}
      </div>
      <p className="text-body-sm text-ink-muted">{t(field === "instantCap" ? "rules.change.instant.help" : "rules.change.budget.help")}</p>
      <Keypad
        value={fresh ? "" : toKeypad(values[field])}
        onChange={(v) => {
          setFresh(false)
          setValues((x) => ({ ...x, [field]: parseKeypad(v) }))
        }}
        onSubmit={submit}
        disabled={busy}
      />

      <section aria-labelledby="rules-preview-h" className="rounded-md bg-surface-sunken p-3">
        <h3 id="rules-preview-h" className="text-label text-ink">
          {t("rules.change.preview")}
        </h3>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-body text-ink">
          <li className={cn(changed.includes("instantCap") && "font-semibold")}>{s.instant}</li>
          <li className={cn(changed.includes("memberBudget") && "font-semibold")}>{s.budget}</li>
        </ul>
        <p className="mt-2 text-body-sm text-ink-muted">{t("rules.change.applies_note")}</p>
      </section>

      <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-line bg-surface px-4 pt-3 pb-[calc(4px+env(safe-area-inset-bottom))] md:-mx-6 md:px-6">
        {phase.tag === "error" && (
          <p role="alert" className="flex items-start gap-2 text-body-sm text-ink" data-rules-error={phase.key}>
            <X aria-hidden className="mt-0.5 size-4 shrink-0 text-declined" strokeWidth={2.5} />
            {t(phase.key as "rules.change.error")}
          </p>
        )}
        <p className="text-body-sm text-ink-muted" aria-live="polite">
          {zero ? t("rules.change.zero") : changed.length === 0 ? t("rules.change.same") : sole ? t("rules.change.sole_note") : t("rules.change.needs", { k: pot.k, n: pot.n })}
        </p>
        <Button
          variant="primary"
          className="w-full"
          onClick={submit}
          disabled={busy || zero || changed.length === 0}
          aria-disabled={!online || undefined}
          aria-busy={busy || undefined}
          data-rules-cta
        >
          {sole ? t("rules.change.cta.apply") : t("rules.change.cta.ask")}
        </Button>
      </div>
    </div>
  )
}

function Diff({ change }: { change: RulesChangeVM }) {
  const fields = changedFields(change.from, change.to)
  const shown = fields.length ? fields : (["instantCap", "memberBudget"] as const)
  const before = ruleSentences(change.from, change.k, change.n)
  const after = ruleSentences(change.to, change.k, change.n)
  const pick = (x: ReturnType<typeof ruleSentences>, f: Field) => (f === "instantCap" ? x.instant : x.budget)
  return (
    <dl className="flex flex-col gap-3" data-rules-diff>
      {shown.map((f) => (
        <div key={f} className="flex flex-col gap-1 rounded-md border border-line p-3">
          <dt className="sr-only">{f === "instantCap" ? t("rules.change.instant.label") : t("rules.change.budget.label")}</dt>
          <dd className="text-body-sm text-ink-muted">
            <span className="mr-1 font-semibold">{t("approve.rules.now")}</span>
            <span className="line-through">{pick(before, f)}</span>
          </dd>
          <dd className="text-body text-ink">
            <span className="mr-1 font-semibold">{t("approve.rules.new")}</span>
            {pick(after, f)}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function ReviewFace({ pot, change, phase, dispatch }: { pot: PotVM; change: RulesChangeVM; phase: Phase; dispatch: (e: Ev) => void }) {
  const online = useOnline()
  const now = useNow()
  const busy = phase.tag === "busy"
  const me = pot.me?.person.id ?? null
  const cast = async (v: "Approve" | "Reject") => {
    if (!online || busy) return
    dispatch({ type: "set", phase: { tag: "busy", what: v === "Approve" ? "approve" : "decline" } })
    if (v === "Approve") announce(t("approve.optimistic", { count: change.approvals.length + 1, k: change.k }))
    try {
      const r = await voteRules(pot.slug, change.proposalId, v)
      if (r === "approved") {
        announce(t("approve.rules.final"))
        dispatch({ type: "set", phase: { tag: "applied", key: "approve.rules.final", title: t("approve.rules.title", { name: change.proposer.name }) } })
      } else if (v === "Reject" || r === "declined") {
        announce(t("approve.rules.declined"))
        dispatch({ type: "set", phase: { tag: "declined" } })
      } else dispatch({ type: "set", phase: { tag: "sent", remaining: Math.max(0, change.k - change.approvals.length - 1) } })
    } catch (e) {
      dispatch({ type: "set", phase: { tag: "error", key: rulesErrorKey(e) } })
    }
  }
  return (
    <div className="flex flex-col gap-4 pt-1" data-rules-sheet="review">
      <div className="flex items-center gap-3">
        <Avatar person={change.proposer} size="md" />
        <p className="text-body-sm text-ink-muted">{t("rules.change.needs", { k: change.k, n: change.n })}</p>
      </div>
      <Diff change={change} />
      <p className="text-body-sm text-ink-muted">{t("rules.change.applies_note")}</p>
      <ApprovalTimeline r={{ approvals: change.approvals, declines: change.declines, pending: change.pending, requester: change.proposer, k: change.k }} me={me} optimistic={busy && phase.what === "approve"} />
      <p className="text-body-sm text-ink-muted">{t("approve.expires", { relativeTime: inWords(change.expiresAt, now) })}</p>
      <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-line bg-surface px-4 pt-3 pb-[calc(4px+env(safe-area-inset-bottom))] md:-mx-6 md:px-6">
        {phase.tag === "error" && (
          <p role="alert" className="flex items-start gap-2 text-body-sm text-ink" data-rules-error={phase.key}>
            <X aria-hidden className="mt-0.5 size-4 shrink-0 text-declined" strokeWidth={2.5} />
            {t(phase.key as "rules.change.error")}
          </p>
        )}
        <Button variant="primary" className="w-full" onClick={() => cast("Approve")} disabled={busy} aria-busy={(busy && phase.what === "approve") || undefined} data-rules-approve>
          {busy && phase.what === "approve" ? t("approve.cta.approving") : t("approve.rules.cta")}
        </Button>
        <Button className="w-full" onClick={() => cast("Reject")} disabled={busy}>
          {t("approve.cta.decline")}
        </Button>
      </div>
    </div>
  )
}

function ResultFace({ pot, change, phase, onDone }: { pot: PotVM; change: RulesChangeVM | null; phase: Phase; onDone: () => void }) {
  const now = useNow()
  const me = pot.me?.person.id ?? null
  let icon = <Clock aria-hidden className="mt-0.5 size-5 shrink-0 text-waiting" strokeWidth={2.25} />
  let line: string
  let tag = "sent"
  if (phase.tag === "applied") {
    icon = <Check aria-hidden className="mt-0.5 size-5 shrink-0 text-approved" strokeWidth={2.5} />
    line = t(phase.key as MessageKey as "rules.change.applied")
    tag = "applied"
  } else if (phase.tag === "declined" || change?.myVote === "Reject") {
    icon = <X aria-hidden className="mt-0.5 size-5 shrink-0 text-declined" strokeWidth={2.5} />
    line = t("approve.rules.declined")
    tag = "declined"
  } else if (change?.mine || phase.tag === "sent") {
    const remaining = phase.tag === "sent" ? phase.remaining : Math.max(0, (change?.k ?? pot.k) - (change?.approvals.length ?? 1))
    line = change?.mine || phase.tag === "sent" ? t("rules.change.sent", { remaining }) : t("approve.optimistic", { count: change?.approvals.length ?? 0, k: change?.k ?? pot.k })
  } else {
    line = t("approve.optimistic", { count: change?.approvals.length ?? 0, k: change?.k ?? pot.k })
  }
  return (
    <div className="flex flex-col gap-4 pt-1" data-rules-sheet="result">
      <p className="flex items-start gap-2 rounded-md bg-surface-sunken p-3 text-body text-ink" data-rules-status={tag}>
        {icon}
        {line}
      </p>
      {change && phase.tag !== "applied" && (
        <>
          <Diff change={change} />
          <ApprovalTimeline r={{ approvals: change.approvals, declines: change.declines, pending: change.pending, requester: change.proposer, k: change.k }} me={me} />
          <p className="text-body-sm text-ink-muted">{t("approve.expires", { relativeTime: inWords(change.expiresAt, now) })}</p>
        </>
      )}
      <div className="sticky bottom-0 -mx-4 border-t border-line bg-surface px-4 pt-3 pb-[calc(4px+env(safe-area-inset-bottom))] md:-mx-6 md:px-6">
        <Button variant="primary" className="w-full" onClick={onDone} data-rules-done>
          {t("spend.done")}
        </Button>
      </div>
    </div>
  )
}
