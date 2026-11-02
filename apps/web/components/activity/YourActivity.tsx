"use client"
// You → "Your activity": the person's own actions across all their Pots, newest first, by day. Loading shows a
// skeleton only after 150 ms; an error offers Try again; nothing yet says what will show up here.
import { Bone, Delayed, EmptyState } from "@/components/feedback/States"
import { ActivityList } from "@/components/activity/ActivityList"
import { Button } from "@/components/ui/button"
import { t } from "@/i18n/t"
import { useMyActivity, useMeInfo } from "@/lib/client/data"
import { useNow } from "@/lib/client/time"
import { giftActivity, type ActivityItemVM } from "@/lib/client/activity"
import { useMyGifts } from "@/lib/client/gifts/data"
import { mockTxHash } from "@/lib/client/mock/world"
import { IS_LIVE } from "@/lib/client/config"
import { useMemo } from "react"

function ActivitySkeleton() {
  return (
    <Delayed>
      <div className="flex flex-col gap-2" aria-hidden data-activity-skeleton>
        <Bone className="h-4 w-20" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-start gap-3 rounded-md bg-surface p-3">
            <Bone className="size-8 rounded-sm" />
            <div className="flex flex-1 flex-col gap-2">
              <Bone className="h-4 w-3/4" />
              <Bone className="h-3 w-1/2" />
            </div>
            <Bone className="h-4 w-14" />
          </div>
        ))}
      </div>
    </Delayed>
  )
}

export function YourActivity({ meId }: { meId: string }) {
  const base = useMyActivity()
  const now = useNow()
  // hub 1.2.0: the gifts I sent, merged in by time (on the pages already loaded while older ones are still to come)
  const gifts = useMyGifts()
  const me = useMeInfo()
  const a = useMemo(() => {
    if (base.state !== "ready" || !gifts?.length || !me) return base
    const until = base.hasMore ? (base.items[base.items.length - 1]?.at ?? 0) : 0
    const extra: ActivityItemVM[] = gifts
      .filter((g) => g.at >= until)
      .map((g) => giftActivity({ ...g, txHash: g.txHash ?? (IS_LIVE ? undefined : mockTxHash(`${g.slug}:gift:${g.ref}`)) }, { id: me.id, name: me.name }))
    return { ...base, items: [...base.items, ...extra].sort((x, y) => y.at - x.at) }
  }, [base, gifts, me])
  return (
    <section aria-labelledby="you-activity-h" className="mt-6" data-you-activity={a.state}>
      <h2 id="you-activity-h" className="mb-2 px-1 font-display text-heading text-ink">
        {t("you.activity.title")}
      </h2>
      {a.state === "loading" || now === 0 ? (
        <ActivitySkeleton />
      ) : a.state === "error" ? (
        <div className="flex flex-col items-start gap-3 rounded-lg bg-surface p-4" role="alert">
          <p className="text-body text-ink">{t("you.activity.error")}</p>
          <Button variant="secondary" onClick={a.retry}>
            {t("you.activity.retry")}
          </Button>
        </div>
      ) : a.items.length === 0 && !a.hasMore ? (
        <EmptyState visual="dots" headingLevel={3} title={t("you.activity.empty.title")} body={t("you.activity.empty.body")} className="rounded-lg bg-surface" />
      ) : (
        <>
          <ActivityList items={a.items} meId={meId} now={now} linked />
          {a.hasMore && (
            <Button variant="ghost" className="mt-3 w-full" onClick={a.loadMore} disabled={a.loadingMore} data-activity-more>
              {t("you.activity.more")}
            </Button>
          )}
        </>
      )}
    </section>
  )
}
