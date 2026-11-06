"use client"
// The group trip cost calculator (/tools/group-trip-cost-calculator): the page's one client island. Plain React
// state, no data layer, no SDK, no i18n table: the math is lib/marketing/trip-cost.ts (import-free), the rule limits
// and every string come in as props from the server page (raw en.json templates, filled here), so the island stays
// a few KB. The server renders it with the default example, so without JS (and for crawlers) the page already shows
// a full result; with JS every keystroke updates it.
//
// Accessibility: a real form with a visible <label> per field, inputMode="decimal" for money, aria-invalid plus a
// described-by message on a bad value (the result keeps the last good numbers), the presets as toggle buttons
// (aria-pressed), and one polite live region that says the new result in a sentence. Amounts use tabular figures.
// Brand: the result's [Start a Pot] (passed in as `cta`) is the page's one marigold; preset chips are `brand-soft`.
import { Check, CircleAlert, Hand, Users } from "lucide-react"
import Link from "next/link"
import { useId, useState } from "react"
import { cn } from "@/lib/client/cn"
import {
  fieldText,
  fill,
  LIMITS,
  parseMoney,
  parseWhole,
  PRESET_IDS,
  PRESETS,
  tripCost,
  usd,
  usdWhole,
  type Approval,
  type CostLine,
  type PresetId,
  type RuleLimits,
  type TripInputs,
} from "@/lib/marketing/trip-cost"

/** Every string the island shows: raw en.json templates (`{name}` placeholders), picked by the server page. */
export interface CalcCopy {
  formLabel: string
  presetsLabel: string
  presets: Record<PresetId, string>
  field: Record<FieldId, string>
  percent: string
  error: { people: string; days: string; money: string; cushion: string; summary: string }
  resultTitle: string
  resultEach: string
  resultHow: string
  resultLive: string
  breakdownCaption: string
  colCost: string
  colAmount: string
  line: { stay: string; travel: string; foodOne: string; foodOther: string; activities: string; cushion: string; cushionSub: string; rounding: string; pot: string }
  paid: { stay: string; travel: string; activities: string; food: string }
  tier: { instant: string; one_ok: string; group: string }
  spare: string
  rulesNote: string
  rulesLink: string
  ctaText: string
}

type FieldId = "people" | "days" | "stay" | "travel" | "food" | "activities" | "cushion"
type Texts = Record<FieldId, string>

const FIELDS: readonly { id: FieldId; kind: "whole" | "money" | "percent" }[] = [
  { id: "people", kind: "whole" },
  { id: "days", kind: "whole" },
  { id: "stay", kind: "money" },
  { id: "travel", kind: "money" },
  { id: "food", kind: "money" },
  { id: "activities", kind: "money" },
  { id: "cushion", kind: "percent" },
]

function textsOf(i: TripInputs): Texts {
  return {
    people: String(i.people),
    days: String(i.days),
    stay: fieldText(i.stay),
    travel: fieldText(i.travelEach),
    food: fieldText(i.foodEachPerDay),
    activities: fieldText(i.activities),
    cushion: String(i.cushionPct),
  }
}

function parseField(id: FieldId, text: string): number | null {
  switch (id) {
    case "people":
      return parseWhole(text, LIMITS.people.min, LIMITS.people.max)
    case "days":
      return parseWhole(text, LIMITS.days.min, LIMITS.days.max)
    case "cushion":
      return text.trim() === "" ? 0 : parseWhole(text, LIMITS.cushionPct.min, LIMITS.cushionPct.max)
    default:
      return parseMoney(text)
  }
}

/** All fields parsed, or null if any is invalid. */
function inputsOf(t: Texts): TripInputs | null {
  const v = Object.fromEntries(FIELDS.map((f) => [f.id, parseField(f.id, t[f.id])])) as Record<FieldId, number | null>
  if (Object.values(v).some((x) => x === null)) return null
  return {
    people: v.people!,
    days: v.days!,
    stay: v.stay!,
    travelEach: v.travel!,
    foodEachPerDay: v.food!,
    activities: v.activities!,
    cushionPct: v.cushion!,
  }
}

export function TripCalculator({
  copy,
  rules,
  initial,
  rulesHref,
  cta,
}: {
  copy: CalcCopy
  /** a new Pot's limits in cents (lib/marketing/trip-cost-defaults.ts) */
  rules: RuleLimits
  initial: PresetId
  /** where "How the rules work" goes */
  rulesHref: string
  /** the marigold [Start a Pot] (a <SignInLink>), rendered under the suggested amount */
  cta: React.ReactNode
}) {
  const id = useId()
  const [texts, setTexts] = useState<Texts>(() => textsOf(PRESETS[initial]))
  const [preset, setPreset] = useState<PresetId | null>(initial)
  const [last, setLast] = useState<TripInputs>(PRESETS[initial])

  const update = (next: Texts, p: PresetId | null) => {
    setTexts(next)
    setPreset(p)
    const parsed = inputsOf(next)
    if (parsed) setLast(parsed)
  }

  const invalid = FIELDS.filter((f) => parseField(f.id, texts[f.id]) === null).map((f) => f.id)
  const r = tripCost(last, rules)
  const errorFor = (f: FieldId) =>
    f === "people"
      ? fill(copy.error.people, { min: LIMITS.people.min, max: LIMITS.people.max })
      : f === "days"
        ? fill(copy.error.days, { min: LIMITS.days.min, max: LIMITS.days.max })
        : f === "cushion"
          ? fill(copy.error.cushion, { min: LIMITS.cushionPct.min, max: LIMITS.cushionPct.max })
          : copy.error.money

  const each = usdWhole(r.each)
  const live = fill(copy.resultLive, { each, cost: usdWhole(r.tripCost), pot: usdWhole(r.pot) })
  const n = last.people
  const lineHead = (l: CostLine) =>
    l.id === "stay"
      ? copy.line.stay
      : l.id === "travel"
        ? fill(copy.line.travel, { each: usdWhole(last.travelEach), n })
        : l.id === "food"
          ? fill(last.days === 1 ? copy.line.foodOne : copy.line.foodOther, { each: usdWhole(last.foodEachPerDay), people: n, n: last.days })
          : copy.line.activities
  const paid = (l: CostLine) => (l.id === "food" ? fill(copy.paid.food, { daily: usdWhole(l.payment) }) : copy.paid[l.id])

  return (
    <div className="rounded-lg bg-surface shadow-card dark:ring-1 dark:ring-line" data-calculator>
      <form
        aria-label={copy.formLabel}
        className="p-4 md:p-6"
        // nothing to submit: the result updates as you type (Enter in a field mustn't reload the page)
        onSubmit={(e) => e.preventDefault()}
      >
        <div role="group" aria-labelledby={`${id}-presets`}>
          <p id={`${id}-presets`} className="text-label text-ink">
            {copy.presetsLabel}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {PRESET_IDS.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={preset === p}
                data-preset={p}
                onClick={() => update(textsOf(PRESETS[p]), p)}
                className={cn(
                  "pot-touch inline-flex min-h-11 items-center gap-1.5 rounded-sm border px-3.5 text-label text-ink",
                  "transition-[background-color,border-color,scale] [--tw-duration:120ms,120ms,200ms] ease-standard active:scale-[.97] active:duration-120 motion-reduce:active:scale-100",
                  preset === p ? "border-brand-deep bg-brand-soft" : "border-line-strong bg-surface hover:bg-surface-sunken",
                )}
              >
                {preset === p ? <Check aria-hidden className="size-4" strokeWidth={2} /> : null}
                {copy.presets[p]}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-x-4 gap-y-4 xs:grid-cols-2">
          {FIELDS.map((f) => {
            const bad = invalid.includes(f.id)
            const inputId = `${id}-${f.id}`
            return (
              // labels that wrap (narrow phones) grow upward, so the two inputs in a row stay level
              <div key={f.id} className="flex min-w-0 flex-col">
                <label htmlFor={inputId} className="block flex-1 text-body-sm font-semibold text-ink">
                  {copy.field[f.id]}
                </label>
                <div
                  className={cn(
                    "mt-1.5 flex h-12 shrink-0 items-center gap-1 rounded-md border bg-surface-sunken px-3",
                    bad ? "border-declined" : "border-line-strong",
                  )}
                >
                  {f.kind === "money" ? (
                    <span aria-hidden className="text-body font-semibold text-ink-muted">
                      $
                    </span>
                  ) : null}
                  <input
                    id={inputId}
                    name={f.id}
                    type="text"
                    inputMode={f.kind === "money" ? "decimal" : "numeric"}
                    enterKeyHint="done"
                    autoComplete="off"
                    value={texts[f.id]}
                    onChange={(e) => update({ ...texts, [f.id]: e.target.value }, null)}
                    aria-invalid={bad || undefined}
                    aria-describedby={bad ? `${inputId}-error` : undefined}
                    data-field={f.id}
                    className="h-full min-w-0 flex-1 bg-transparent font-sans text-body font-semibold text-ink tabular-nums"
                  />
                  {f.kind === "percent" ? (
                    <span aria-hidden className="text-body font-semibold text-ink-muted">
                      {copy.percent}
                    </span>
                  ) : null}
                </div>
                {bad ? (
                  <p id={`${inputId}-error`} className="mt-1.5 flex items-start gap-1.5 text-body-sm text-ink">
                    <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-declined" strokeWidth={2} />
                    {errorFor(f.id)}
                  </p>
                ) : null}
              </div>
            )
          })}
        </div>
      </form>

      <div className="border-t border-line p-4 md:p-6" data-calc-result>
        <h2 id={`${id}-result`} className="text-label text-ink-muted">
          {copy.resultTitle}
        </h2>
        <p className="mt-1 text-body text-ink">
          <span className="sr-only">{copy.resultEach} </span>
          <span className="block font-display text-[2.5rem] leading-[1.1] font-extrabold text-ink tabular-nums" data-money data-calc-each>
            {usd(r.each)}
          </span>
        </p>
        <p className="mt-2 text-body-sm text-ink-muted tabular-nums">
          {fill(copy.resultHow, { cost: usdWhole(r.tripCost), pct: last.cushionPct, n })}
        </p>
        {invalid.length ? (
          <p className="mt-2 flex items-start gap-1.5 text-body-sm text-ink">
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-declined" strokeWidth={2} />
            {copy.error.summary}
          </p>
        ) : null}
        {/* one sentence for screen readers whenever the result changes */}
        <p className="sr-only" aria-live="polite" data-calc-live>
          {live}
        </p>

        <div className="mt-4 flex flex-col gap-3 rounded-md bg-surface-sunken p-3 sm:flex-row sm:items-center sm:justify-between dark:bg-ground">
          <p className="text-body-sm text-ink tabular-nums" data-calc-cta-text>
            {fill(copy.ctaText, { each })}
          </p>
          {cta}
        </div>

        <table className="mt-6 w-full border-collapse" data-calc-breakdown>
          <caption className="pb-2 text-left font-display text-heading text-ink">{copy.breakdownCaption}</caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="py-2 pr-2 text-left text-body-sm font-semibold text-ink-muted">
                {copy.colCost}
              </th>
              <th scope="col" className="py-2 pl-2 text-right text-body-sm font-semibold text-ink-muted">
                {copy.colAmount}
              </th>
            </tr>
          </thead>
          {r.lines.map((l) => (
            <Row key={l.id} id={l.id} head={lineHead(l)} amount={l.total}>
              {l.approval ? (
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>{paid(l)}</span>
                  <TierChip approval={l.approval} copy={copy.tier} />
                </span>
              ) : null}
            </Row>
          ))}
          <Row id="cushion" head={fill(copy.line.cushion, { pct: last.cushionPct })} amount={r.cushion}>
            {copy.line.cushionSub}
          </Row>
          {r.rounding > 0 ? <Row id="rounding" head={copy.line.rounding} amount={r.rounding} /> : null}
          <tfoot>
            <tr className="border-t border-line-strong">
              <th scope="row" className="py-3 pr-2 text-left text-label text-ink">
                {copy.line.pot}
              </th>
              <td className="py-3 pl-2 text-right text-label text-ink tabular-nums" data-money data-calc-pot>
                {usd(r.pot)}
              </td>
            </tr>
          </tfoot>
        </table>

        <p className="mt-4 text-body-sm text-ink-muted tabular-nums">{fill(copy.spare, { spare: usdWhole(r.spare) })}</p>
        <p className="mt-2 text-body-sm text-ink-muted tabular-nums">
          {fill(copy.rulesNote, { instant: usdWhole(rules.instant), oneOk: usdWhole(rules.oneOk) })}
          <Link href={rulesHref} prefetch={false} className="ml-1 text-link underline underline-offset-4">
            {copy.rulesLink}
          </Link>
        </p>
      </div>
    </div>
  )
}

function Row({ id, head, amount, children }: { id: string; head: string; amount: number; children?: React.ReactNode }) {
  return (
    <tbody data-row={id} className="border-b border-line">
      <tr>
        <th scope="row" className={cn("pt-3 pr-2 text-left text-body font-normal text-ink tabular-nums", children ? "pb-1" : "pb-3")}>
          {head}
        </th>
        <td className={cn("pt-3 pl-2 text-right align-top text-body text-ink tabular-nums", children ? "pb-1" : "pb-3")} data-money>
          {usd(amount)}
        </td>
      </tr>
      {children ? (
        <tr>
          <td colSpan={2} className="pb-3 text-body-sm text-ink-muted tabular-nums">
            {children}
          </td>
        </tr>
      ) : null}
    </tbody>
  )
}

function TierChip({ approval, copy }: { approval: Approval; copy: CalcCopy["tier"] }) {
  const Icon = approval.tier === "instant" ? Check : approval.tier === "one_ok" ? Hand : Users
  const word = approval.tier === "group" ? fill(copy.group, { k: approval.k, n: approval.n }) : copy[approval.tier]
  return (
    <span data-status={approval.tier} className="inline-flex items-center gap-1 text-ink">
      <Icon aria-hidden className={cn("size-4 shrink-0", approval.tier === "instant" ? "text-approved" : "text-waiting")} strokeWidth={2} />
      {word}
    </span>
  )
}
