"use client"
// RulePreview (ux-spec §4.9; design-direction 02 §3): the neutral rule sentence under the Spend sheet's amount
// (never brand-soft: that's for the real approval). Its own module (moved out of SpendSheet.tsx, which re-exports
// it) so the /demo explainer's phone can show it without loading the sheet's data hooks.
import { Check, Clock, X } from "lucide-react"
import { t, tLines } from "@/i18n/t"
import type { PotVM } from "@/lib/client/mock/types"
import { formatUsd, type Micro } from "@/lib/client/money"
import type { SpendPreview } from "@/lib/client/rules"
import { cn } from "@/lib/client/cn"

function previewCopy(p: SpendPreview, pot: Pick<PotVM, "rules" | "balance">, used: Micro): [string, string | null] {
  const instantLimit = formatUsd(pot.rules.instantCap, "whole")
  switch (p.reason) {
    case "empty":
      return [t("preview.empty", { instantLimit }), null]
    case "ok":
      return tLines("preview.instant", { instantLimit })
    case "over_cap":
      return tLines("preview.vote.over_cap", { k: p.k, n: p.n, instantLimit })
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

export function RulePreview({ preview, pot, used }: { preview: SpendPreview; pot: Pick<PotVM, "rules" | "balance">; used: Micro }) {
  const [title, body] = previewCopy(preview, pot, used)
  const icon =
    preview.path === "instant" ? (
      <Check aria-hidden className="size-5 text-approved" strokeWidth={2.5} />
    ) : preview.path === "vote" ? (
      <Clock aria-hidden className="size-5 text-waiting" strokeWidth={2.25} />
    ) : preview.path === "blocked" ? (
      <X aria-hidden className="size-5 text-declined" strokeWidth={2.5} />
    ) : null
  return (
    <div aria-live="polite" data-rule-preview={preview.path} className="flex min-h-16 items-start gap-3 rounded-md bg-surface-sunken p-3">
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0">
        <p className={cn(body ? "text-label text-ink" : "text-body-sm text-ink-muted")}>{title}</p>
        {body && <p className="mt-0.5 text-body-sm text-ink-muted">{body}</p>}
      </div>
    </div>
  )
}

