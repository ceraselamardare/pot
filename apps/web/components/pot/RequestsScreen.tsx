"use client"
// Requests (ux-spec §4.11, design-direction 02 §5b): three stacked sections, no inner tabs.
// Waiting on you (RequestCards with the Pot's name) · Your requests (status only; no withdraw, Phase 3) ·
// Decided (last 30 days, struck-through amounts always paired with "Not sent"). No marigold on this tab.
import { Check } from "lucide-react"
import { EmptyState, CardsSkeleton } from "@/components/feedback/States"
import { RequestRow, reasonWord } from "@/components/pot/Feed"
import { RequestCard } from "@/components/pot/RequestCard"
import { StatusChip } from "@/components/pot/StatusChip"
import { Avatar } from "@/components/pot/Avatar"
import { CommentCount } from "@/components/comments/RequestComments"
import { MoneyText } from "@/components/money/MoneyText"
import { ApproveSheet } from "@/components/sheets/ApproveSheet"
import { pageTitle, t } from "@/i18n/t"
import { useMe, usePot, useRequests } from "@/lib/client/data"
import { formatUsd } from "@/lib/client/money"
import { closeSheet, openRequest, useSheetParams } from "@/lib/client/sheet"
import { useNow, inTime } from "@/lib/client/time"

export function RequestsScreen() {
  const reqs = useRequests()
  const me = useMe()
  const now = useNow()
  const { requestId, params } = useSheetParams()
  const potSlug = params.get("pot")
  const empty = reqs && reqs.waiting.length === 0 && reqs.mine.length === 0 && reqs.decided.length === 0
  return (
    <>
      <title>{pageTitle(t("requests.title"))}</title>
      <main id="main" className="mx-auto w-full max-w-flow px-4 pb-8 md:px-6">
        <h1 className="pt-5 pb-4 font-display text-title text-ink">{t("requests.title")}</h1>
        {!reqs || !me ? (
          <CardsSkeleton />
        ) : empty ? (
          <EmptyState visual="check" title={t("requests.empty.title")} body={t("requests.empty.body")} />
        ) : (
          <div className="flex flex-col gap-8">
            <section aria-labelledby="rq-waiting" className="flex flex-col gap-3">
              <h2 id="rq-waiting" className="font-display text-heading text-ink">
                {t("requests.section.waiting")}
                {reqs.waiting.length > 0 && <span className="text-ink-muted tabular-nums">{countSuffix(reqs.waiting.length)}</span>}
              </h2>
              {reqs.waiting.length === 0 ? (
                <p className="flex items-center gap-2 text-body-sm text-ink-muted">
                  <Check aria-hidden className="size-4 text-approved" strokeWidth={2.5} />
                  {t("requests.section.waiting.empty")}
                </p>
              ) : (
                reqs.waiting.map((r) => <RequestCard key={`${r.slug}:${r.id}`} r={r} me={me} now={now} showPot />)
              )}
            </section>

            {reqs.mine.length > 0 && (
              <section aria-labelledby="rq-mine" className="flex flex-col gap-3">
                <h2 id="rq-mine" className="font-display text-heading text-ink">
                  {t("requests.section.mine")}
                </h2>
                <ul className="flex flex-col gap-2">
                  {reqs.mine.map((r) => (
                    <li key={`${r.slug}:${r.id}`}>
                      <button
                        type="button"
                        onClick={() => openRequest(r.id, r.slug)}
                        className="flex w-full items-start gap-3 rounded-md bg-surface p-3 text-left hover:bg-surface-sunken"
                      >
                        <Avatar person={r.requester} size="sm" className="mt-0.5" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-body text-ink">
                            {t("requests.mine.row", { amount: formatUsd(r.amount, "whole"), reason: reasonWord(r) })}
                          </span>
                          <span className="mt-0.5 flex gap-1.5 text-body-sm text-ink-muted">
                            <span aria-hidden>{r.potEmoji}</span>
                            <span>{r.potName}</span>
                          </span>
                          <span className="mt-2 flex flex-wrap items-center gap-2">
                            <StatusChip status="needs">{t("approve.progress", { count: r.approvals.length, k: r.k })}</StatusChip>
                            <span className="text-body-sm text-ink-muted">{t("approve.expires", { relativeTime: inTime(r.expiresAt, now) })}</span>
                            <CommentCount n={r.comments} />
                          </span>
                        </span>
                        <MoneyText micro={r.amount} className="pt-0.5 text-ink" />
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="text-body-sm text-ink-muted">{t("approve.own.hint")}</p>
              </section>
            )}

            {reqs.decided.length > 0 && (
              <section aria-labelledby="rq-history" className="flex flex-col gap-3">
                <h2 id="rq-history" className="font-display text-heading text-ink">
                  {t("requests.section.history")}
                </h2>
                <ul className="flex flex-col gap-2">
                  {reqs.decided.map((r) => (
                    <RequestRow key={`${r.slug}:${r.id}`} r={r} now={now} />
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </main>
      {potSlug && <RequestSheet slug={potSlug} requestId={requestId} />}
    </>
  )
}

const countSuffix = (n: number) => ` · ${n}`

function RequestSheet({ slug, requestId }: { slug: string; requestId: number | null }) {
  const res = usePot(slug)
  if (res.state !== "ready") return null
  return <ApproveSheet pot={res.data} requestId={requestId} onClose={closeSheet} />
}
