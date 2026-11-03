"use client"
// The Pot's actions (2026-11-03 redesign, notes/frontend.md "Pot actions"): a row of four round buttons with a
// short label under each, right under the balance, as in Revolut's account screen and Wise's group balances.
//   1. Add money: the screen's one marigold (eggplant icon); neutral while an arrived deposit card holds it (D-50).
//   2. Spend.
//   3. Ask (= "Ask for more money", the top-up ask), or Invite while the Pot has one person (nobody to ask yet, and
//      inviting is what a new Pot needs).
//   4. More: the rest in a sheet (?sheet=more): Invite friends (or Ask, swapped with slot 3), Gifts, Pot record,
//      Who can see what, Close Pot. A closed Pot has no row; its header keeps a ••• that opens the same sheet.
// An action that can't run now stays visible: aria-disabled, at half opacity, its reason tied to it
// (aria-describedby), and a tap says why (closing, offline, the goal lock, an open ask).
// The same row on every width: an even 4-up grid on phones, fixed 80 px columns from bp-md.
import { ArrowUpRight, Ellipsis, Eye, Gift, HandCoins, ListChecks, LogOut, Plus, UserPlus, type LucideIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Sheet } from "@/components/sheets/Sheet"
import { t } from "@/i18n/t"
import { useOnline } from "@/lib/client/browser"
import { cn } from "@/lib/client/cn"
import { GIFTS_ON } from "@/lib/client/gifts/flag"
import type { PotVM } from "@/lib/client/mock/types"
import { openSheet, swapSheet } from "@/lib/client/sheet"

/** "Ask for more money": its reason line, and whether it can open now (one open ask per Pot; 2+ people; open Pots). */
export function topupState(pot: PotVM): { sub: string; disabled: boolean } {
  if (pot.status !== "open" || pot.closingInFlight) return { sub: t("pot.closing"), disabled: true }
  if (pot.topup) return { sub: pot.topup.mine ? t("topup.menu.open_mine") : t("topup.menu.open", { name: pot.topup.asker.name }), disabled: true }
  if (pot.members.length < 2) return { sub: t("topup.menu.alone"), disabled: true }
  return { sub: t("topup.menu.sub"), disabled: false }
}

/** Slot 3 is Invite while the Pot has one person, else Ask. */
export const inviteInRow = (pot: PotVM) => pot.members.length < 2

interface Action {
  key: "add" | "spend" | "ask" | "invite" | "more"
  label: string
  /** the accessible name when it says more than the label (it always starts with the label: WCAG 2.5.3) */
  name?: string
  Icon: LucideIcon
  run: () => void
  /** why it can't run now (aria-disabled; a tap toasts it) */
  why?: string | null
  marigold?: boolean
}

export function PotActions({
  pot,
  addVariant = "primary",
  spendBlocked,
}: {
  pot: PotVM
  /** integrations (D-50): "secondary" while an arrived deposit card holds the screen's one marigold */
  addVariant?: "primary" | "secondary"
  /** hub 1.1.0: why Spend waits (an all-or-nothing goal not reached yet) */
  spendBlocked?: string | null
}) {
  const online = useOnline()
  const closing = pot.status !== "open" || !!pot.closingInFlight
  const paused = (offline: "add.offline" | "spend.offline") => (closing ? t("pot.closing") : !online ? t(offline) : null)
  const ask = topupState(pot)
  const actions: Action[] = [
    { key: "add", label: t("pot.cta.add"), Icon: Plus, run: () => openSheet("add"), why: paused("add.offline"), marigold: addVariant === "primary" },
    { key: "spend", label: t("pot.cta.spend"), Icon: ArrowUpRight, run: () => openSheet("spend"), why: paused("spend.offline") ?? spendBlocked },
    inviteInRow(pot)
      ? { key: "invite", label: t("pot.action.invite"), name: t("members.invite_cta"), Icon: UserPlus, run: () => openSheet("share") }
      : { key: "ask", label: t("pot.action.ask"), name: t("topup.menu"), Icon: HandCoins, run: () => openSheet("topup"), why: ask.disabled ? ask.sub : null },
    { key: "more", label: t("pot.action.more"), name: t("pot.menu.label", { potName: pot.name }), Icon: Ellipsis, run: () => openSheet("more") },
  ]
  return (
    <div
      role="group"
      aria-label={t("pot.actions.label")}
      className="mt-4 grid grid-cols-4 gap-1 md:flex md:gap-4"
      data-pot-actions
    >
      {actions.map(({ key, label, name, Icon, run, why, marigold }) => (
        <button
          key={key}
          type="button"
          aria-label={name}
          aria-disabled={why ? true : undefined}
          aria-describedby={why ? `pot-action-${key}-why` : undefined}
          aria-haspopup="dialog"
          onClick={() => (why ? toast(why) : run())}
          className={cn(
            "group flex min-w-0 flex-col items-center gap-1.5 rounded-md text-center select-none md:w-20",
            why && "opacity-50",
          )}
          data-action={key}
          data-spend-blocked={key === "spend" && spendBlocked ? "goal" : undefined}
        >
          <span
            aria-hidden
            data-circle
            className={cn(
              "grid size-14 shrink-0 place-items-center rounded-pill border transition-[background-color,border-color,scale] [--tw-duration:120ms,120ms,200ms] ease-standard",
              "group-active:scale-[.94] group-active:duration-120 motion-reduce:group-active:scale-100",
              marigold
                ? "border-(--pot-brand-border) bg-brand text-on-brand group-active:bg-brand-deep"
                : "border-transparent bg-surface-sunken text-ink group-hover:border-line-strong",
            )}
          >
            <Icon className="size-6" strokeWidth={2} />
          </span>
          <span className="line-clamp-2 text-body-sm break-words text-ink">{label}</span>
        </button>
      ))}
      {/* the reasons sit outside the buttons, so they describe them without joining their names */}
      {actions.map(({ key, why }) =>
        why ? (
          <span key={key} id={`pot-action-${key}-why`} className="sr-only">
            {why}
          </span>
        ) : null,
      )}
    </div>
  )
}

/** One row of the More sheet: an icon, a name and (optionally) a second line; aria-disabled with its reason. */
function MoreItem({
  Icon,
  title,
  sub,
  disabled,
  onClick,
  data,
}: {
  Icon: LucideIcon
  title: string
  sub?: string
  disabled?: boolean
  onClick: () => void
  data: string
}) {
  return (
    <li>
      <button
        type="button"
        aria-disabled={disabled || undefined}
        onClick={disabled ? undefined : onClick}
        className={cn(
          "flex min-h-14 w-full items-center gap-3 rounded-md px-3 py-2 text-left text-body text-ink hover:bg-surface-sunken",
          disabled && "cursor-not-allowed text-ink-muted hover:bg-transparent",
        )}
        data-more={data}
      >
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-pill bg-surface-sunken">
          <Icon className="size-5" strokeWidth={2} />
        </span>
        <span className="flex min-w-0 flex-col">
          <span>{title}</span>
          {sub && <span className="text-body-sm text-ink-muted">{sub}</span>}
        </span>
      </button>
    </li>
  )
}

/**
 * ?sheet=more: what isn't in the row. Picking a sheet swaps it in (same history entry, so ✕ and Back leave both);
 * the Pot record replaces this entry, so Back from it lands on the Pot.
 */
export function PotMoreSheet({ pot, open, onClose }: { pot: PotVM; open: boolean; onClose: () => void }) {
  const router = useRouter()
  const ask = topupState(pot)
  const closed = pot.status === "closed"
  // the row shows Invite in a Pot of one; there, Ask waits here with its reason instead
  const askHere = !closed && pot.status === "open" && inviteInRow(pot)
  return (
    <Sheet open={open} onClose={onClose} title={t("pot.more.title")} description={pot.name}>
      <ul className="-mx-3 flex flex-col pb-2" data-more-list>
        {(closed || !inviteInRow(pot)) && (
          <MoreItem Icon={UserPlus} title={t("members.invite_cta")} sub={t("pot.more.invite.sub")} onClick={() => swapSheet("share")} data="invite" />
        )}
        {askHere && <MoreItem Icon={HandCoins} title={t("topup.menu")} sub={ask.sub} disabled={ask.disabled} onClick={() => swapSheet("topup")} data="ask" />}
        {/* hub 1.2.0: gifts on/off, the public gift page */}
        {GIFTS_ON && <MoreItem Icon={Gift} title={t("gift.menu")} sub={t("gift.menu.sub")} onClick={() => swapSheet("gifts")} data="gifts" />}
        {/* hub 1.1.0: the public Pot record (every spend, shareable, CSV) */}
        <MoreItem
          Icon={ListChecks}
          title={t("pot.menu.record")}
          sub={t("pot.menu.record.sub")}
          onClick={() => router.replace(`/p/${pot.slug}/record`)}
          data="record"
        />
        {/* privacy audit 2026-11-02: what's public and what only the Pot sees (the shell's PwaHost opens it) */}
        <MoreItem Icon={Eye} title={t("privacy.menu")} sub={t("privacy.menu.sub")} onClick={() => swapSheet("privacy")} data="privacy" />
        <MoreItem
          Icon={LogOut}
          title={closed ? t("close.summary.cta") : t("pot.menu.close")}
          sub={closed ? undefined : pot.status === "closing" ? t("close.menu.waiting") : t("close.menu.sub")}
          onClick={() => swapSheet("close")}
          data="close"
        />
      </ul>
    </Sheet>
  )
}
