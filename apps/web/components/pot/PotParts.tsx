"use client"
// PotHeader (cover tile + H1 + seats + ••• menu) and PotCard (Pots home), design-direction 02 §1-2.
import { Menu } from "@base-ui/react/menu"
import { ChevronLeft, EllipsisVertical, Eye, Gift, ListChecks, LogOut, Share2 } from "lucide-react"
import { useRouter } from "next/navigation"
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
import { GIFTS_ON } from "@/lib/client/gifts/flag"

const itemCls =
  "flex min-h-12 w-full cursor-default items-center gap-3 rounded-sm px-3 text-left text-body text-ink outline-none select-none data-highlighted:bg-surface-sunken data-disabled:text-ink-muted"

export function PotHeader({ pot }: { pot: PotVM }) {
  const router = useRouter()
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
      <Menu.Root>
        <Menu.Trigger
          aria-label={t("pot.menu.label", { potName: pot.name })}
          className="-mr-2 grid size-11 shrink-0 place-items-center rounded-pill text-ink hover:bg-surface-sunken data-popup-open:bg-surface-sunken"
        >
          <EllipsisVertical aria-hidden className="size-6" strokeWidth={2} />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner sideOffset={6} align="end" className="z-50 outline-none">
            <Menu.Popup className="min-w-60 origin-(--transform-origin) rounded-md border border-line bg-surface p-1 shadow-card outline-none transition-[opacity,scale] duration-120 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
              <Menu.Item className={itemCls} onClick={() => openSheet("share")}>
                <Share2 aria-hidden className="size-5" strokeWidth={2} />
                {t("pot.menu.share")}
              </Menu.Item>
              {/* hub 1.1.0: the public Pot record (every spend, shareable, CSV) */}
              <Menu.Item className={itemCls} onClick={() => router.push(`/p/${pot.slug}/record`)} data-menu-record>
                <ListChecks aria-hidden className="size-5" strokeWidth={2} />
                <span className="flex flex-col py-1">
                  <span>{t("pot.menu.record")}</span>
                  <span className="text-body-sm text-ink-muted">{t("pot.menu.record.sub")}</span>
                </span>
              </Menu.Item>
              {/* hub 1.2.0: gifts on/off, the public gift page */}
              {GIFTS_ON && (
                <Menu.Item className={itemCls} onClick={() => openSheet("gifts")} data-menu-gifts>
                  <Gift aria-hidden className="size-5" strokeWidth={2} />
                  <span className="flex flex-col py-1">
                    <span>{t("gift.menu")}</span>
                    <span className="text-body-sm text-ink-muted">{t("gift.menu.sub")}</span>
                  </span>
                </Menu.Item>
              )}
              {/* privacy audit 2026-11-02: what's public and what only the Pot sees (the shell's PwaHost opens it) */}
              <Menu.Item className={itemCls} onClick={() => openSheet("privacy")} data-menu-privacy>
                <Eye aria-hidden className="size-5" strokeWidth={2} />
                <span className="flex flex-col py-1">
                  <span>{t("privacy.menu")}</span>
                  <span className="text-body-sm text-ink-muted">{t("privacy.menu.sub")}</span>
                </span>
              </Menu.Item>
              <Menu.Item className={itemCls} onClick={() => openSheet("close")} data-menu-close>
                <LogOut aria-hidden className="size-5" strokeWidth={2} />
                {pot.status === "closed" ? (
                  t("close.summary.cta")
                ) : (
                  <span className="flex flex-col py-1">
                    <span>{t("pot.menu.close")}</span>
                    <span className="text-body-sm text-ink-muted">{pot.status === "closing" ? t("close.menu.waiting") : t("close.menu.sub")}</span>
                  </span>
                )}
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
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
