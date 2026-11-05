"use client"
// The hero's "$X each" (the creator's per-person aim, Create's "about how much each?"): one ring per member, filling
// toward X, instead of a made-up total bar (Monzo split's member tiles + Vivid/Cash App's goal ring, Mobbin 2026-11-05).
// Ink on surface-sunken, never marigold (the hero's Add money is the screen's one marigold; a marigold ring would read
// as a button). A full ring gets a check (icon + the sr-only word). An empty Pot shows an Invite slot.
import { Check, UserPlus } from "lucide-react"
import { Avatar } from "@/components/pot/Avatar"
import { t } from "@/i18n/t"
import { formatUsd, type Micro } from "@/lib/client/money"
import { openSheet } from "@/lib/client/sheet"
import type { MemberVM } from "@/lib/client/mock/types"

const SHOWN = 5
const R = 25 // ring radius in a 56 × 56 box (stroke 3), around a 40 px avatar

function Ring({ fraction }: { fraction: number }) {
  const c = 2 * Math.PI * R
  return (
    <svg aria-hidden viewBox="0 0 56 56" className="absolute inset-0 size-full -rotate-90">
      <circle cx="28" cy="28" r={R} fill="none" strokeWidth="3" className="stroke-ink-muted/30" />
      {fraction > 0 && (
        <circle
          cx="28"
          cy="28"
          r={R}
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${c * fraction} ${c}`}
          className="stroke-ink transition-[stroke-dasharray] duration-500 motion-reduce:transition-none"
        />
      )}
    </svg>
  )
}

export function EachStrip({ each, members, invite }: { each: Micro; members: readonly MemberVM[]; invite?: boolean }) {
  // me first, then by join order (the Members tab's order)
  const sorted = [...members].sort((a, b) => Number(b.isMe) - Number(a.isMe))
  const shown = sorted.slice(0, SHOWN)
  const more = sorted.length - shown.length
  const done = members.filter((m) => m.contributed >= each).length
  return (
    <section
      aria-label={t("pot.each.title", { each: formatUsd(each, "whole") })}
      className="mt-4 rounded-md bg-surface-sunken/60 p-3"
      data-goal-each
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-body-sm tabular-nums">
        <p className="text-ink">{t("pot.each.title", { each: formatUsd(each, "whole") })}</p>
        <p className="text-ink-muted" data-each-done>
          {t("pot.each.done", { done, n: members.length })}
        </p>
      </div>
      <ul className="mt-3 flex flex-wrap gap-3">
        {shown.map((m) => {
          const fraction = each > 0n ? Math.min(1, Number((m.contributed * 1000n) / each) / 1000) : 0
          const full = fraction >= 1
          const name = m.isMe ? t("pot.each.you") : m.person.name
          return (
            <li key={m.person.id} className="flex w-14 shrink-0 flex-col items-center gap-1" data-each-member={m.person.id}>
              <span className="relative grid size-14 place-items-center">
                <Ring fraction={fraction} />
                <Avatar person={m.person} size="md" />
                {full && (
                  <span className="absolute -right-0.5 -bottom-0.5 grid size-5 place-items-center rounded-pill bg-ink text-surface">
                    <Check aria-hidden className="size-3" strokeWidth={3} />
                  </span>
                )}
              </span>
              <span className="w-full truncate text-center text-body-sm text-ink">{name}</span>
              <span className="text-body-sm text-ink-muted tabular-nums">
                {formatUsd(m.contributed, "whole")}
                <span className="sr-only">
                  {" "}
                  {full
                    ? t("pot.each.member_done", { each: formatUsd(each, "whole") })
                    : t("pot.each.member_of", { each: formatUsd(each, "whole") })}
                </span>
              </span>
            </li>
          )
        })}
        {more > 0 && (
          <li className="flex w-14 shrink-0 flex-col items-center gap-1">
            <span className="grid size-14 place-items-center rounded-pill bg-surface text-label text-ink tabular-nums">+{more}</span>
          </li>
        )}
        {invite && (
          <li className="flex w-14 shrink-0 flex-col items-center gap-1">
            <button
              type="button"
              onClick={() => openSheet("share")}
              className="grid size-14 place-items-center rounded-pill border-2 border-dashed border-ink-muted/50 text-ink-muted hover:text-ink"
            >
              <UserPlus aria-hidden className="size-5" strokeWidth={2} />
              <span className="sr-only">{t("members.invite_cta")}</span>
            </button>
            <span aria-hidden className="text-body-sm text-ink-muted">
              {t("pot.each.invite")}
            </span>
          </li>
        )}
      </ul>
    </section>
  )
}
