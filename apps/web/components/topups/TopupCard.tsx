"use client"
// The open "Ask for more money" card (on the Pot's Activity, and in Requests → Waiting on you with the Pot's name):
// who asks for how much and why, how far everyone is ("2 of 4 have added" + who's still to add), and what I can do:
// [Add $50] opens the Add sheet with my part prefilled and the ask marked (?sheet=add&amount=…&topup=<id>); [Nudge]
// reminds everyone still to add who hasn't had a nudge today (once per person per 24 h); the asker can cancel.
// Buttons are secondary: the screen's one marigold stays Add money in the hero (Requests has none).
import { Ban, BellRing, Check, Plus } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"
import { Avatar, AvatarStack } from "@/components/pot/Avatar"
import { Sheet } from "@/components/sheets/Sheet"
import { names } from "@/components/pot/Feed"
import { StatusChip } from "@/components/pot/StatusChip"
import { Button } from "@/components/ui/button"
import { t } from "@/i18n/t"
import { useOnline } from "@/lib/client/browser"
import { formatUsd } from "@/lib/client/money"
import type { TopupVM } from "@/lib/client/mock/types"
import { openSheet } from "@/lib/client/sheet"
import { formatDate } from "@/lib/client/time"
import { cancelTopup, nudgeErrorKey, nudgeTopup } from "@/lib/client/topups/actions"
import { myLeft, nudgeTargets, waitingOthers } from "@/lib/client/topups/vm"
import { addHref, amountParam } from "@/lib/topups"

export function topupTitle(v: TopupVM): string {
  const amount = formatUsd(v.perPerson, "whole")
  return v.mine ? t("topup.card.title.mine", { amount }) : t("topup.card.title", { name: v.asker.name, amount })
}

export function TopupCard({ v, me, showPot }: { v: TopupVM; me: string; now?: number; showPot?: boolean }) {
  const online = useOnline()
  const [busy, setBusy] = useState<"nudge" | "cancel" | null>(null)
  const [confirm, setConfirm] = useState(false)
  const left = myLeft(v)
  const waiting = waitingOthers(v, me)
  const targets = nudgeTargets(v, me)
  const titleId = `topup-${v.slug}-${v.id}-title`
  const n = v.members.length

  const nudge = async () => {
    if (busy || targets.length === 0) return
    if (!online) return void toast(t("topup.offline"))
    setBusy("nudge")
    try {
      const done = await nudgeTopup(
        v.slug,
        v.id,
        targets.map((m) => m.person.id),
      )
      const who = v.members.filter((m) => done.includes(m.person.id)).map((m) => m.person)
      toast.success(t("members.nudge.sent", { name: names(who) }))
    } catch (e) {
      toast.error(t(nudgeErrorKey(e) as "topup.nudge.failed"))
    } finally {
      setBusy(null)
    }
  }
  const cancel = async () => {
    if (busy) return
    if (!online) return void toast(t("topup.offline"))
    setBusy("cancel")
    try {
      await cancelTopup(v.slug, v.id)
      toast(t("topup.cancelled"))
    } catch {
      toast.error(t("topup.cancel.failed"))
      setBusy(null)
    }
  }

  return (
    <article
      aria-labelledby={titleId}
      className="pot-enter rounded-md border border-line bg-surface p-3 shadow-card"
      data-topup-card={v.id}
    >
      {showPot && (
        <p className="mb-1.5 flex items-center gap-1.5 text-body-sm text-ink-muted">
          <span aria-hidden>{v.potEmoji}</span>
          {v.potName}
        </p>
      )}
      <div className="flex items-start gap-3">
        <Avatar person={v.asker} size="sm" ring="surface" className="mt-0.5" />
        <div className="min-w-0 flex-1">
          {/* who asks for how much each; the reason (if any) on one muted line under it */}
          <h3 id={titleId} className="text-body text-ink">
            {topupTitle(v)}
          </h3>
          {v.reason && (
            <p className="truncate text-body-sm text-ink-muted" title={v.reason} data-topup-reason>
              {t("topup.card.reason", { reason: v.reason })}
            </p>
          )}
          {/* one meta line: status chip, progress, total and date */}
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm text-ink-muted tabular-nums">
            <StatusChip status="needs" size="sm">
              {t("topup.chip.asking")}
            </StatusChip>
            <span className="text-ink" data-topup-progress={`${v.doneCount}/${n}`}>
              {t("topup.card.progress", { done: v.doneCount, n })}
            </span>
            <span data-topup-sum>{t("topup.card.sum", { total: formatUsd(v.total, "whole"), date: formatDate(v.dueAt) })}</span>
          </p>
        </div>
        {v.mine && (
          // the asker's quiet "Cancel ask": an icon in the corner; a small sheet asks first
          <button
            type="button"
            onClick={() => setConfirm(true)}
            aria-label={t("topup.cancel")}
            title={t("topup.cancel")}
            className="-mt-1 -mr-1 grid size-11 shrink-0 place-items-center rounded-pill text-ink-muted hover:bg-surface-sunken hover:text-ink"
            data-topup-cancel
          >
            <Ban aria-hidden className="size-5" strokeWidth={2} />
          </button>
        )}
      </div>

      {/* one row: who's still to add (faces) or "You added", then the actions */}
      {(left > 0n || waiting.length > 0 || v.me?.done) && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {waiting.length > 0 && (
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="contents">
                <AvatarStack people={waiting.map((m) => m.person)} size="xs" ring="surface" />
              </span>
              <span className="sr-only" data-topup-waiting>
                {t("topup.card.waiting_for", { names: names(waiting.map((m) => m.person)) })}
              </span>
            </span>
          )}
          {v.me?.done && (
            <span className="inline-flex items-center gap-1 text-body-sm text-ink" data-topup-you-done>
              <Check aria-hidden className="size-4 text-approved" strokeWidth={2.5} />
              {t("topup.card.you_done", { amount: formatUsd(v.me.part, "whole") })}
            </span>
          )}
          <span className="ml-auto flex items-center gap-2">
            {left > 0n &&
              (showPot ? (
                <Button size="sm" render={<Link href={addHref(v.slug, v.id, left)} />} data-topup-add>
                  <Plus aria-hidden strokeWidth={2.25} />
                  {t("topup.card.add", { amount: formatUsd(left, "whole") })}
                </Button>
              ) : (
                <Button size="sm" onClick={() => openSheet("add", { amount: amountParam(left), topup: v.id })} data-topup-add>
                  <Plus aria-hidden strokeWidth={2.25} />
                  {t("topup.card.add", { amount: formatUsd(left, "whole") })}
                </Button>
              ))}
            {waiting.length > 0 &&
              (targets.length > 0 ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void nudge()}
                  aria-label={t("topup.card.nudge.a11y", { names: names(targets.map((m) => m.person)) })}
                  aria-busy={busy === "nudge" || undefined}
                  disabled={busy === "nudge"}
                  data-topup-nudge
                >
                  <BellRing aria-hidden strokeWidth={2.25} />
                  {t("members.nudge")}
                </Button>
              ) : (
                <span className="inline-flex items-center gap-1 text-body-sm text-ink-muted" data-topup-nudged>
                  <Check aria-hidden className="size-4" strokeWidth={2.5} />
                  <span aria-hidden>{t("topup.card.nudged")}</span>
                  <span className="sr-only">{t("topup.card.nudged.a11y")}</span>
                </span>
              ))}
          </span>
        </div>
      )}
      {v.mine && (
        <Sheet
          open={confirm}
          onClose={() => setConfirm(false)}
          title={t("topup.cancel.title")}
          footer={
            <div className="flex flex-col gap-2">
              <Button className="w-full" onClick={() => void cancel()} aria-busy={busy === "cancel" || undefined} disabled={busy === "cancel"} data-topup-cancel-yes>
                {t("topup.cancel.yes")}
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => setConfirm(false)}>
                {t("topup.cancel.no")}
              </Button>
            </div>
          }
        >
          <p className="pt-1 text-body text-ink" data-topup-confirm>
            {t("topup.cancel.confirm")}
          </p>
        </Sheet>
      )}
    </article>
  )
}
