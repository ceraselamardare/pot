"use client"
// The Settings tab ("pay in", notes/frontend.md 2026-11-03; it was the Rules tab): a grouped list. Each section's header
// says who decides; rows drill into the sheets that already exist, so More and Settings open the same things.
//   RULES · the group decides: the rule sentences (open, first) and "Changing the rules" (RulesSheet).
//   MONEY FROM OUTSIDE · anyone, right away (the gifts flag): "Taking money from outside" (the hub's set_gifts; one
//     member, no vote, with "Anyone in the Pot can turn this off at once."), Public page On/Off › (?sheet=publicpage),
//     Pay-in links N active › (?sheet=payinlinks) and [Make a pay-in link] (Ask anyone, ?sheet=payin).
//   PAYING PEOPLE OUTSIDE · the group decides: Send by link On/Off › (the rules sheet, its switch in view:
//     ?sheet=rules&rule=links).
//   PEOPLE: Invite link · until … › (Share) · Who can see what › (Privacy).
//   RECORD: See every spend › (/p/<slug>/record) · On the explorer ↗.
//   CLOSE POT · the group decides: Close Pot and share out › (CloseSheet, its waiting and closed states).
// Ink rows on surface, ink-muted values and chevrons; no marigold (the hero's Add money keeps it).
import { ArrowUpRight, ChevronRight, Eye, Globe, Link2, ListChecks, LogOut, Send, ShieldCheck, UserPlus, type LucideIcon } from "lucide-react"
import Link from "next/link"
import { useState, type ReactNode } from "react"
import { toast } from "sonner"
import { SwitchRow } from "@/components/gifts/Switch"
import { RulesSection } from "@/components/pot/Tabs"
import { Button } from "@/components/ui/button"
import { t } from "@/i18n/t"
import { announce } from "@/lib/client/browser"
import { cn } from "@/lib/client/cn"
import { daoOf } from "@/lib/client/config"
import { explorerAccountUrl } from "@/lib/client/explorer"
import { setGiftsOn } from "@/lib/client/gifts/actions"
import { useGiftLinks } from "@/lib/client/gifts/data"
import { GIFTS_ON } from "@/lib/client/gifts/flag"
import type { PotVM } from "@/lib/client/mock/types"
import { openSheet } from "@/lib/client/sheet"
import { formatDate } from "@/lib/client/time"

function Section({ id, title, who, children }: { id: string; title: string; who?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-h`} className="flex flex-col gap-2" data-settings-section={id}>
      <h2 id={`${id}-h`} className="px-1 text-body-sm text-ink-muted">
        <span className="font-semibold tracking-wide text-ink uppercase">{title}</span>
        {who && <span> · {who}</span>}
      </h2>
      {children}
    </section>
  )
}

const ROW = "flex min-h-13 w-full items-center gap-3 px-4 py-3 text-left text-body text-ink transition-colors duration-120 hover:bg-surface-sunken"

/** One drill-in row: icon, label, the value (ink-muted) and a chevron (or ↗ for an outside page). */
function Row({
  Icon,
  label,
  value,
  onClick,
  href,
  external,
  name,
  ...data
}: {
  Icon: LucideIcon
  label: string
  value?: string
  onClick?: () => void
  href?: string
  external?: boolean
  name?: string
} & { [k: `data-${string}`]: string | boolean | undefined }) {
  const inner = (
    <>
      <Icon aria-hidden className="size-5 shrink-0" strokeWidth={2} />
      <span className="min-w-0 flex-1">{label}</span>
      {value && <span className="shrink-0 text-body-sm text-ink-muted tabular-nums">{value}</span>}
      {external ? (
        <ArrowUpRight aria-hidden className="size-5 shrink-0 text-ink-muted" strokeWidth={2} />
      ) : (
        <ChevronRight aria-hidden className="size-5 shrink-0 text-ink-muted" strokeWidth={2} />
      )}
    </>
  )
  const aria = name ?? (value ? t("settings.row.a11y", { label, value }) : undefined)
  if (href && external)
    return (
      <a href={href} target="_blank" rel="noopener" aria-label={aria} className={ROW} {...data}>
        {inner}
      </a>
    )
  if (href)
    return (
      <Link href={href} aria-label={aria} className={ROW} {...data}>
        {inner}
      </Link>
    )
  return (
    <button type="button" onClick={onClick} aria-label={aria} aria-haspopup="dialog" className={ROW} {...data}>
      {inner}
    </button>
  )
}

function Rows({ children, className }: { children: ReactNode; className?: string }) {
  return <ul className={cn("flex flex-col divide-y divide-line overflow-hidden rounded-md bg-surface", className)}>{children}</ul>
}

export function SettingsTab({ pot }: { pot: PotVM }) {
  const open = pot.status === "open"
  const closeSub = pot.status === "closed" ? t("close.summary.cta") : pot.status === "closing" ? t("close.menu.waiting") : undefined
  return (
    <div className="flex flex-col gap-8" data-settings>
      <Section id="rules" title={t("settings.rules.h")} who={t("settings.who.group")}>
        <RulesSection pot={pot} />
      </Section>

      {GIFTS_ON && <MoneyFromOutside pot={pot} />}

      <Section id="settings-sending" title={t("settings.sending.h")} who={t("settings.who.group")}>
        <Rows>
          <li>
            <Row
              Icon={Send}
              label={t("settings.sending")}
              value={pot.extras?.links ? t("settings.on") : t("settings.off")}
              onClick={() => openSheet("rules", { rule: "links" })}
              data-settings-row="sending"
            />
          </li>
        </Rows>
      </Section>

      <Section id="settings-people" title={t("settings.people.h")}>
        <Rows>
          <li>
            <Row
              Icon={UserPlus}
              label={t("settings.invite")}
              value={pot.invite ? t("settings.invite.until", { date: formatDate(pot.invite.expiresAt) }) : open ? t("settings.invite.missing") : undefined}
              onClick={() => openSheet("share")}
              data-settings-row="invite"
            />
          </li>
          <li>
            <Row Icon={Eye} label={t("privacy.menu")} onClick={() => openSheet("privacy")} data-settings-row="privacy" />
          </li>
        </Rows>
      </Section>

      <Section id="settings-record" title={t("settings.record.h")}>
        <Rows>
          <li>
            <Row Icon={ListChecks} label={t("rules.record")} href={`/p/${pot.slug}/record`} data-record-link />
          </li>
          <li>
            <Row
              Icon={Globe}
              label={t("settings.explorer")}
              href={explorerAccountUrl(daoOf(pot.slug))}
              external
              name={t("pot.explorer.label", { potName: pot.name })}
              data-explorer-account
            />
          </li>
        </Rows>
      </Section>

      <Section id="settings-close" title={t("settings.close.h")} who={t("settings.who.group")}>
        <Rows>
          <li>
            <Row Icon={LogOut} label={t("settings.close")} value={closeSub} onClick={() => openSheet("close")} data-settings-row="close" />
          </li>
        </Rows>
      </Section>
    </div>
  )
}

/** Money from outside: the set_gifts switch (any member, right away), the public page, the pay-in links. */
function MoneyFromOutside({ pot }: { pot: PotVM }) {
  const links = useGiftLinks(pot.slug)
  const [busy, setBusy] = useState(false)
  const g = pot.gifts
  const taking = g?.on !== false
  const open = pot.status === "open"
  const toggle = async (on: boolean) => {
    setBusy(true)
    try {
      await setGiftsOn(pot.slug, on)
      announce(on ? t("settings.taking.on") : t("settings.taking.off"))
    } catch {
      toast.error(t("payin.error.toggle"))
    } finally {
      setBusy(false)
    }
  }
  const n = links?.length
  return (
    <Section id="settings-outside" title={t("settings.outside.h")} who={t("settings.who.anyone")}>
      <div className="overflow-hidden rounded-md bg-surface">
        <div className="flex flex-col gap-2 px-4 pt-2 pb-3">
          <SwitchRow
            checked={taking}
            onChange={(on) => void toggle(on)}
            label={t("settings.taking")}
            hint={taking ? t("settings.taking.on") : t("settings.taking.off")}
            busy={busy}
            disabled={!open}
            data-settings-taking
          />
          <p className="flex items-start gap-2 text-body-sm text-ink-muted" data-settings-safety>
            <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
            {t("settings.taking.safety")}
          </p>
        </div>
        <ul className="flex flex-col divide-y divide-line border-t border-line">
          <li>
            <Row Icon={Globe} label={t("settings.page")} value={g?.page.on ? t("settings.on") : t("settings.off")} onClick={() => openSheet("publicpage")} data-settings-row="page" />
          </li>
          <li>
            <Row
              Icon={Link2}
              label={t("settings.payins")}
              value={n === undefined ? undefined : n > 0 ? t("settings.payins.n", { n }) : t("settings.payins.none")}
              onClick={() => openSheet("payinlinks")}
              data-settings-row="payins"
            />
          </li>
        </ul>
      </div>
      {open && taking && (
        <Button className="w-full" onClick={() => openSheet("payin")} data-settings-make>
          <Link2 aria-hidden strokeWidth={2} />
          {t("settings.payins.make")}
        </Button>
      )}
    </Section>
  )
}
