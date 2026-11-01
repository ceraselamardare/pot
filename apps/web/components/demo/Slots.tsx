// /demo/all's timeline pieces (05 §3.2), static (the technical read has no player: every step open):
//  - BeatSlot: one step of a chapter's "What happens, step by step" timeline, its plain caption first.
//  - YouChip: who holds the phone at the chapter's end ("You're Maya" / "Now you're Leo").
import { Smartphone } from "lucide-react"
import type { ReactNode } from "react"
import { Avatar } from "@/components/pot/Avatar"
import { t } from "@/i18n/t"
import type { PersonVM } from "@/lib/client/mock/types"

export function BeatSlot({
  i,
  total,
  id,
  pane,
  children,
}: {
  i: number
  total: number
  id: string
  pane: "app" | "hood"
  /** the collapsed title (kept for the call sites; every step is open here) */
  label?: string
  children: ReactNode
}) {
  const n = i + 1
  return (
    <li id={id} data-beat-slot={n} data-state="past" data-pane={pane} className="relative scroll-mt-24 pb-10 pl-8 last:pb-0 lg:pl-10">
      {/* the rail and the dot */}
      <span aria-hidden className="absolute top-8 bottom-0 left-[0.6875rem] w-0.5 rounded-pill bg-line [li:last-child>&]:hidden" />
      <span
        aria-hidden
        data-dot
        className="absolute top-0.5 left-0 grid size-6 place-items-center rounded-pill border-2 border-ink bg-ground text-body-sm font-semibold text-ink tabular-nums [html[data-theme=night]_&]:bg-surface"
      >
        {n}
      </span>
      <div className="flex min-h-7 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-label text-ink tabular-nums">{t("demo.step", { n, total })}</span>
        {pane === "app" ? (
          <span className="inline-flex items-center gap-1 rounded-pill bg-surface-sunken px-2 py-0.5 text-body-sm text-ink">
            <Smartphone aria-hidden className="size-3.5" strokeWidth={2} />
            {t("demo.timeline.app")}
          </span>
        ) : null}
      </div>
      <div data-slot-body className="mt-1.5 flex flex-col gap-3">
        {children}
      </div>
    </li>
  )
}

/** "You're Maya" / "Now you're Leo": who holds the phone at the end of the chapter. */
export function YouChip({ yous, people }: { yous: string[]; people: Record<string, PersonVM> }) {
  const who = yous[yous.length - 1] ?? yous[0]!
  const person = people[who]!
  const switched = who !== yous[0]
  return (
    <p className="inline-flex min-h-9 items-center gap-2 rounded-pill bg-surface py-1 pr-3.5 pl-1 shadow-card" data-you={who}>
      <Avatar person={person} size="sm" />
      <span className="text-label text-ink">{switched ? t("demo.you.switch", { name: person.name }) : t("demo.you", { name: person.name })}</span>
    </p>
  )
}
