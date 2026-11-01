"use client"
// ApprovalTimeline (ux-spec §3, §6.4; design-direction 02 §5a): who asked, whose approval counted, who is left.
// Its own module (moved out of RequestCard.tsx, which re-exports it) so the /demo explainer's phone can show it
// without loading the request card's actions and ops store.
import { Check, Circle, X } from "lucide-react"
import { Avatar } from "@/components/pot/Avatar"
import { names } from "@/components/pot/Feed"
import { t } from "@/i18n/t"
import type { PersonVM, RequestVM } from "@/lib/client/mock/types"
import { cn } from "@/lib/client/cn"

/** Who asked, whose approval counted, who is left (requests, close and rules changes share it). */
export type TimelineSubject = Pick<RequestVM, "approvals" | "declines" | "pending" | "requester" | "k">

export function ApprovalTimeline({ r, me, optimistic }: { r: TimelineSubject; me: string | null; optimistic?: boolean }) {
  const approvals = optimistic && me && !r.approvals.some((p) => p.id === me) ? [...r.approvals, r.pending.find((p) => p.id === me)!].filter(Boolean) : r.approvals
  const pending = r.pending.filter((p) => !approvals.some((a) => a.id === p.id))
  const rows: { p: PersonVM; state: "yes" | "no" | "wait"; text: string }[] = [
    ...approvals.map((p) => ({
      p,
      state: "yes" as const,
      text: p.id === r.requester.id ? t("approve.timeline.asked", { name: p.name }) : t("approve.timeline.approved", { name: p.id === me ? t("feed.you") : p.name }),
    })),
    ...r.declines.map((p) => ({ p, state: "no" as const, text: t("approve.timeline.declined", { name: p.id === me ? t("feed.you") : p.name }) })),
    ...pending.map((p) => ({
      p,
      state: "wait" as const,
      text: p.id === me ? t("approve.timeline.you_waiting") : t("approve.timeline.waiting", { name: p.name }),
    })),
  ]
  const summary = `${t("approve.progress", { count: approvals.length, k: r.k })}: ${names(approvals)}`
  return (
    <section aria-label={t("approve.progress", { count: approvals.length, k: r.k })}>
      <h3 className="text-label text-ink">{t("approve.timeline.header", { count: approvals.length, k: r.k })}</h3>
      <p className="sr-only">{summary}</p>
      <ol className="mt-3 flex flex-col gap-3" aria-hidden>
        {rows.map(({ p, state, text }) => (
          <li key={p.id} className="flex items-center gap-3">
            <span className="grid size-6 place-items-center">
              {state === "yes" && (
                <span className="grid size-6 place-items-center rounded-pill bg-approved text-surface">
                  <Check className="size-4" strokeWidth={3} />
                </span>
              )}
              {state === "no" && (
                <span className="grid size-6 place-items-center rounded-pill bg-declined text-surface">
                  <X className="size-4" strokeWidth={3} />
                </span>
              )}
              {state === "wait" && <Circle className="size-5 text-line-strong" strokeWidth={2} />}
            </span>
            <Avatar person={p} size="xs" />
            <span className={cn("text-body-sm", state === "wait" ? "text-ink-muted" : "text-ink")}>{text}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
