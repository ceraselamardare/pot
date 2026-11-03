"use client"
// Requests (ux-spec §4.11, design-direction 02 §5b): three stacked sections, no inner tabs.
// Waiting on you (RequestCards with the Pot's name) · Your requests (status only; no withdraw, Phase 3) ·
// Decided (last 30 days, struck-through amounts always paired with "Not sent"). No marigold on this tab.
import { Check } from "lucide-react"
import { EmptyState, CardsSkeleton } from "@/components/feedback/States"
import { RequestRow } from "@/components/pot/Feed"
import { RequestCard } from "@/components/pot/RequestCard"
import { ApproveSheet } from "@/components/sheets/ApproveSheet"
import { pageTitle, t } from "@/i18n/t"
import { useMe, usePot, useRequests } from "@/lib/client/data"
import { closeSheet, useSheetParams } from "@/lib/client/sheet"
import { TopupCard } from "@/components/topups/TopupCard"
import { useInboxTopups } from "@/lib/client/topups/data"
import { useNow } from "@/lib/client/time"

export function RequestsScreen() {
  const reqs = useRequests()
  // "Ask for a top-up": open asks in my Pots where I haven't added my part sit with what's waiting on me
  const topups = useInboxTopups() ?? []
  const me = useMe()
  const now = useNow()
  const { requestId, params } = useSheetParams()
  const potSlug = params.get("pot")
  const empty = reqs && reqs.waiting.length === 0 && reqs.mine.length === 0 && reqs.decided.length === 0 && topups.length === 0
  const waitingN = (reqs?.waiting.length ?? 0) + topups.length
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
                {waitingN > 0 && <span className="text-ink-muted tabular-nums">{countSuffix(waitingN)}</span>}
              </h2>
              {topups.map((v) => (
                <TopupCard key={`${v.slug}:topup:${v.id}`} v={v} me={me} now={now} showPot />
              ))}
              {waitingN === 0 ? (
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
                    <RequestRow key={`${r.slug}:${r.id}`} r={r} now={now} showPot />
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
