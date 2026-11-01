"use client"
// RulePreview (ux-spec §4.9; design-direction 02 §3): the neutral rule sentence under the Spend sheet's amount
// (never brand-soft: that's for the real approval). Its own module (moved out of SpendSheet.tsx, which re-exports
// it) so the /demo explainer's phone can show it without loading the sheet's data hooks.
// `DecisionLine` is the Spend sheet's compact form (2026-11-01 declutter): icon + the decision in one line, and the
// why (the limit, trust, what you'd get back) behind an ⓘ. A blocked spend (the goal, the Pot's balance) shows its
// reason in full, since that's what the person needs to know.
import { Check, Clock, Hand, Info, Lock, X } from "lucide-react"
import { useId, useState, type ReactNode } from "react"
import { t, tLines } from "@/i18n/t"
import type { PotVM } from "@/lib/client/mock/types"
import { formatUsd, type Micro } from "@/lib/client/money"
import type { SpendPreview } from "@/lib/client/rules"
import { cn } from "@/lib/client/cn"

type PreviewPot = Pick<PotVM, "rules" | "balance"> & Partial<Pick<PotVM, "goalDetail">>

export function previewCopy(p: SpendPreview, pot: PreviewPot, used: Micro): [string, string | null] {
  const instantLimit = formatUsd(pot.rules.instantCap, "whole")
  // hub 1.1.0: earned trust raised this person's limit (the sentence says "your" limit then)
  const limit = p.effectiveCap !== undefined ? formatUsd(p.effectiveCap, "whole") : instantLimit
  const raised = p.effectiveCap !== undefined && p.effectiveCap > pot.rules.instantCap
  if (p.path === "vote" && p.tier === "one_ok") {
    switch (p.reason) {
      case "over_budget":
        return tLines("preview.one_ok.over_budget", { memberBudget: formatUsd(pot.rules.memberBudget, "whole"), used: formatUsd(used, "whole") })
      case "recipient":
        return tLines("preview.one_ok.recipient")
      case "new_member":
        return tLines("preview.one_ok.new_member")
      default:
        return tLines("preview.one_ok.over_cap", { limit })
    }
  }
  switch (p.reason) {
    case "goal": {
      const g = pot.goalDetail
      if (g && g.state !== "collecting") return tLines("preview.goal.missed")
      return tLines("preview.goal", { collected: formatUsd(g?.totalIn ?? 0n, "whole"), goal: formatUsd(g?.amount ?? 0n, "whole") })
    }
    case "empty":
      return [raised ? t("trust.you.up_to", { amount: limit }) : t("preview.empty", { instantLimit }), null]
    case "ok":
      return raised ? tLines("preview.instant.trust", { limit }) : tLines("preview.instant", { instantLimit })
    case "over_cap":
      return raised ? tLines("preview.vote.over_cap.trust", { k: p.k, n: p.n, limit }) : tLines("preview.vote.over_cap", { k: p.k, n: p.n, instantLimit })
    case "over_budget":
      return tLines("preview.vote.over_budget", {
        k: p.k,
        n: p.n,
        memberBudget: formatUsd(pot.rules.memberBudget, "whole"),
        used: formatUsd(used, "whole"),
      })
    case "recipient":
      return tLines("preview.vote.recipient", { k: p.k, n: p.n })
    case "new_member":
      return tLines("preview.vote.new_member", { k: p.k, n: p.n })
    case "balance":
      return tLines("preview.blocked.balance", { balance: formatUsd(pot.balance) })
  }
}

function previewIcon(preview: SpendPreview) {
  return preview.reason === "goal" ? (
    <Lock aria-hidden className="size-5 text-ink" strokeWidth={2} />
  ) : preview.path === "instant" ? (
    <Check aria-hidden className="size-5 text-approved" strokeWidth={2.5} />
  ) : preview.path === "vote" && preview.tier === "one_ok" ? (
    <Hand aria-hidden className="size-5 text-waiting" strokeWidth={2.25} />
  ) : preview.path === "vote" ? (
    <Clock aria-hidden className="size-5 text-waiting" strokeWidth={2.25} />
  ) : preview.path === "blocked" ? (
    <X aria-hidden className="size-5 text-declined" strokeWidth={2.5} />
  ) : null
}

/**
 * One line: icon + the decision ("This will be approved instantly"), ⓘ for the why. `details` are extra lines for
 * the ⓘ panel (the Spend sheet's "you'd get back"). Same data attributes as RulePreview, so tests and styles agree.
 */
export function DecisionLine({ preview, pot, used, details = [] }: { preview: SpendPreview; pot: PreviewPot; used: Micro; details?: ReactNode[] }) {
  const [title, body] = previewCopy(preview, pot, used)
  const [open, setOpen] = useState(false)
  const id = useId()
  const icon = previewIcon(preview)
  // blocked: the reason is the point, so it's always shown; otherwise the why waits behind the ⓘ
  const blocked = preview.path === "blocked"
  const more = [...(!blocked && body ? [body] : []), ...details]
  return (
    <div aria-live="polite" data-rule-preview={preview.path} data-tier={preview.tier} data-decision className="rounded-md bg-surface-sunken">
      <div className={cn("flex min-h-12 items-center gap-2.5 py-1 pl-3", more.length ? "pr-0.5" : "pr-3")}>
        {icon && <span className="shrink-0">{icon}</span>}
        <p className={cn("min-w-0 flex-1", body || blocked ? "text-label text-ink" : "text-body-sm text-ink-muted")}>{title}</p>
        {more.length > 0 && (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={`${id}-why`}
            aria-label={t("spend.decision.more")}
            onClick={() => setOpen((o) => !o)}
            className="grid size-11 shrink-0 place-items-center rounded-pill text-ink-muted hover:bg-line aria-expanded:text-ink"
            data-decision-more
          >
            <Info aria-hidden className="size-5" strokeWidth={2} />
          </button>
        )}
      </div>
      {blocked && body && <p className="-mt-1 pr-3 pb-3 pl-10.5 text-body-sm text-ink-muted">{body}</p>}
      {more.length > 0 && (
        <div id={`${id}-why`} hidden={!open} className="flex flex-col gap-1.5 pr-3 pb-3 pl-10.5 text-body-sm text-ink-muted" data-decision-why>
          {more.map((m, i) => (
            <div key={i}>{m}</div>
          ))}
        </div>
      )}
    </div>
  )
}

export function RulePreview({ preview, pot, used }: { preview: SpendPreview; pot: PreviewPot; used: Micro }) {
  const [title, body] = previewCopy(preview, pot, used)
  const icon =
    preview.path === "instant" ? (
      <Check aria-hidden className="size-5 text-approved" strokeWidth={2.5} />
    ) : preview.path === "vote" && preview.tier === "one_ok" ? (
      <Hand aria-hidden className="size-5 text-waiting" strokeWidth={2.25} />
    ) : preview.path === "vote" ? (
      <Clock aria-hidden className="size-5 text-waiting" strokeWidth={2.25} />
    ) : preview.path === "blocked" ? (
      <X aria-hidden className="size-5 text-declined" strokeWidth={2.5} />
    ) : null
  return (
    <div aria-live="polite" data-rule-preview={preview.path} data-tier={preview.tier} className="flex min-h-16 items-start gap-3 rounded-md bg-surface-sunken p-3">
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0">
        <p className={cn(body ? "text-label text-ink" : "text-body-sm text-ink-muted")}>{title}</p>
        {body && <p className="mt-0.5 text-body-sm text-ink-muted">{body}</p>}
      </div>
    </div>
  )
}

