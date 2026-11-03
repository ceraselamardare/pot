"use client"
// PotHeader (cover tile + H1 + seats) and PotCard (Pots home), design-direction 02 §1-2.
// The Pot's ••• lives in its action row (components/pot/PotActions → ?sheet=more); a closed Pot has no row, so its
// header keeps a ••• that opens the same sheet (one "more" list, never two).
import { ChevronLeft, Ellipsis } from "lucide-react"
import Link from "next/link"
import { AvatarStack } from "@/components/pot/Avatar"
import { CoverTile } from "@/components/pot/CoverTile"
import { GoalBar } from "@/components/pot/GoalBar"
import { StatusChip } from "@/components/pot/StatusChip"
import { MoneyText } from "@/components/money/MoneyText"
import { t } from "@/i18n/t"
import { formatUsd } from "@/lib/client/money"
import type { PotCardVM, PotVM } from "@/lib/client/mock/types"
import { openSheet } from "@/lib/client/sheet"
import { cn } from "@/lib/client/cn"

export function PotHeader({ pot }: { pot: PotVM }) {
  return (
    <header className="flex flex-wrap items-center gap-2 pt-3 pb-4">
      <Link
        href="/pots"
        aria-label={t("pot.back")}
        className="-ml-2 grid size-11 shrink-0 place-items-center rounded-pill text-ink hover:bg-surface-sunken lg:hidden"
      >
        <ChevronLeft aria-hidden className="size-6" strokeWidth={2} />
      </Link>
      <CoverTile emoji={pot.emoji} cover={pot.cover} size="sm" />
      {/* rem-based min width: at 200 % text the name takes a line of its own instead of truncating (F-25) */}
      <h1 className="min-w-[7.5rem] flex-1 font-display text-title break-words text-ink">{pot.name}</h1>
      <AvatarStack people={pot.members.map((m) => m.person).sort((a, b) => (a.joinIndex ?? 0) - (b.joinIndex ?? 0))} size="sm" />
      {pot.status === "closed" && (
        <button
          type="button"
          aria-label={t("pot.menu.label", { potName: pot.name })}
          aria-haspopup="dialog"
          onClick={() => openSheet("more")}
          className="-mr-2 grid size-11 shrink-0 place-items-center rounded-pill text-ink hover:bg-surface-sunken"
          data-header-more
        >
          <Ellipsis aria-hidden className="size-6" strokeWidth={2} />
        </button>
      )}
    </header>
  )
}

export function PotCard({ pot }: { pot: PotCardVM }) {
  const label = [
    t("pots.card.a11y", { potName: pot.name, balance: formatUsd(pot.balance), share: formatUsd(pot.myShare, "whole") }),
    pot.waiting > 0 ? t("pots.card.waiting", { n: pot.waiting }) : null,
  ]
    .filter(Boolean)
    .join(", ")
  return (
    <Link
      href={`/p/${pot.slug}`}
      aria-label={label}
      className="group block rounded-lg bg-surface p-4 shadow-card transition-transform duration-120 ease-standard active:scale-[.98] motion-reduce:active:scale-100 md:p-5"
      data-pot-card={pot.slug}
    >
      <div className="flex items-center gap-3">
        <CoverTile emoji={pot.emoji} cover={pot.cover} size="md" />
        <p className="min-w-0 flex-1 truncate font-display text-heading text-ink">{pot.name}</p>
        <AvatarStack people={pot.members} size="xs" ring="surface" />
      </div>
      <p className="mt-4 flex flex-wrap items-baseline gap-x-2">
        <MoneyText micro={pot.balance} variant="title" className="text-ink" />
        <span className="text-body-sm text-ink-muted">{t("pots.card.in_pot")}</span>
      </p>
      <p className="mt-1 text-body-sm text-ink-muted">
        {pot.status === "closed" ? t("pots.card.closed_refund", { refund: formatUsd(pot.myShare) }) : t("pots.card.share", { share: formatUsd(pot.myShare, "whole") })}
      </p>
      {pot.waiting > 0 ? (
        <StatusChip status="needs" className="mt-3">
          {t("pots.card.waiting", { n: pot.waiting })}
        </StatusChip>
      ) : pot.goal !== null && pot.totalIn < pot.goal ? (
        <GoalBar collected={pot.totalIn} goal={pot.goal} size="sm" className={cn("mt-3")} />
      ) : null}
    </Link>
  )
}
