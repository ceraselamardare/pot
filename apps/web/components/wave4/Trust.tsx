"use client"
// Earned trust (hub 1.1.0): a friendly badge (icon + word, never colour alone; ink on surface-sunken because trust is
// not a status) and the "your instant limit" card: "You can spend up to $200 without asking · 2 more paid spends to
// $300", with the three-step streak as a small meter (ink, never marigold: that's the goal bar's colour).
import { BadgeCheck, ShieldCheck, Sprout } from "lucide-react"
import { t } from "@/i18n/t"
import { cn } from "@/lib/client/cn"
import type { TrustVM } from "@/lib/client/mock/types"
import { formatUsd } from "@/lib/client/money"

const ICONS = [Sprout, ShieldCheck, BadgeCheck] as const

export function trustWord(level: number): string {
  return t(`trust.level.${Math.max(0, Math.min(2, level))}` as "trust.level.0")
}

/** `iconOnly` (member rows): just the icon in a round chip; the word stays for screen readers and as a tooltip. */
export function TrustBadge({ trust, className, iconOnly }: { trust: Pick<TrustVM, "level">; className?: string; iconOnly?: boolean }) {
  const level = Math.max(0, Math.min(2, trust.level))
  const Icon = ICONS[level]!
  if (iconOnly)
    return (
      <span
        data-trust-level={level}
        title={trustWord(level)}
        className={cn("inline-flex size-6 shrink-0 items-center justify-center rounded-pill bg-surface-sunken text-ink", className)}
      >
        <Icon aria-hidden className="size-3.5" strokeWidth={2.25} />
        <span className="sr-only">{trustWord(level)}</span>
      </span>
    )
  return (
    <span
      data-trust-level={level}
      className={cn("inline-flex h-6 shrink-0 items-center gap-1 rounded-pill bg-surface-sunken pr-2 pl-1.5 text-body-sm font-semibold whitespace-nowrap text-ink", className)}
    >
      <Icon aria-hidden className="size-3.5" strokeWidth={2.25} />
      <span>{trustWord(level)}</span>
    </span>
  )
}

/** "You can spend up to $X without asking" + the next level, for the signed-in member (Rules tab, You). */
export function MyTrustCard({ trust, potName, className, headingLevel = 3 }: { trust: TrustVM; potName?: string; className?: string; headingLevel?: 2 | 3 }) {
  const H = `h${headingLevel}` as "h2" | "h3"
  const done = trust.step - trust.nextLevelIn
  return (
    <section aria-label={potName ? `${t("trust.you.title")} · ${potName}` : t("trust.you.title")} className={cn("rounded-md bg-surface p-4", className)} data-my-trust>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <H className="text-label text-ink">{potName ?? t("trust.you.title")}</H>
        {trust.enabled && <TrustBadge trust={trust} />}
      </div>
      <p className="mt-1 text-body text-ink tabular-nums" data-trust-up-to>
        {t("trust.you.up_to", { amount: formatUsd(trust.instantUpTo, "whole") })}
      </p>
      {trust.enabled && trust.nextCap !== null ? (
        <>
          <div aria-hidden className="mt-3 flex gap-1">
            {Array.from({ length: trust.step }, (_, i) => (
              <span key={i} className={cn("h-1.5 flex-1 rounded-pill", i < done ? "bg-ink" : "bg-surface-sunken")} />
            ))}
          </div>
          <p className="mt-1.5 text-body-sm text-ink-muted tabular-nums" data-trust-next>
            {t("trust.you.next", { n: trust.nextLevelIn, next: formatUsd(trust.nextCap, "whole") })}
          </p>
          <p className="mt-0.5 text-body-sm text-ink-muted tabular-nums">{t("trust.you.counts", { min: formatUsd(trust.minQualifying, "whole") })}</p>
        </>
      ) : trust.enabled ? (
        <p className="mt-1.5 text-body-sm text-ink-muted">{t("trust.you.top")}</p>
      ) : null}
      {trust.instantUpTo < trust.effectiveCap && (
        <p className="mt-1.5 text-body-sm text-ink-muted tabular-nums">{t("trust.you.left", { left: formatUsd(trust.instantUpTo, "whole") })}</p>
      )}
    </section>
  )
}
