"use client"
// Members → tap a person → what they did in this Pot (URL state: ?sheet=person&who=<id>, so Back closes it and the
// link can be shared). Built from the Pot's own view model (chain views ⊕ the feed route on testnet), newest first,
// with a quiet receipt wherever a real transaction is behind the row. A row about a spend opens its details (the
// request sheet replaces this one; Back comes here again).
import { useMemo } from "react"
import { ActivityList } from "@/components/activity/ActivityList"
import { EmptyState } from "@/components/feedback/States"
import { Avatar } from "@/components/pot/Avatar"
import { Sheet } from "@/components/sheets/Sheet"
import { Button } from "@/components/ui/button"
import { TrustBadge, trustWord } from "@/components/wave4/Trust"
import { formatUsd } from "@/lib/client/money"
import { t } from "@/i18n/t"
import { activityOfPerson } from "@/lib/client/activity"
import type { PotVM } from "@/lib/client/mock/types"
import { openRequest } from "@/lib/client/sheet"
import { useNow } from "@/lib/client/time"

export function PersonActivitySheet({ pot, who, open, onClose }: { pot: PotVM; who: string | null; open: boolean; onClose: () => void }) {
  const now = useNow()
  const meId = pot.me?.person.id ?? null
  const member = who ? pot.members.find((m) => m.person.id === who) : undefined
  const items = useMemo(() => (who ? activityOfPerson(pot, who) : []), [pot, who])
  const name = member?.person.name ?? t("person.fallback")
  const title = who !== null && who === meId ? t("activity.person.title.you", { potName: pot.name }) : t("activity.person.title", { name })
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <Button className="w-full" onClick={onClose}>
          {t("activity.person.done")}
        </Button>
      }
    >
      <div className="flex flex-col gap-4 pt-1" data-person-activity={who ?? ""}>
        {member && (
          <div className="flex items-center gap-3">
            <Avatar person={member.person} size="md" />
            <p className="text-body-sm text-ink-muted">{pot.name}</p>
            {member.trust?.enabled && <TrustBadge trust={member.trust} className="ml-auto" />}
          </div>
        )}
        {/* hub 1.1.0: their earned trust in words (what they can spend without asking, how many paid spends so far) */}
        {member?.trust?.enabled && (
          <div className="rounded-md bg-surface-sunken p-3" data-person-trust>
            <p className="text-label text-ink">
              {member.isMe ? t("trust.person.title.you", { level: trustWord(member.trust.level) }) : t("trust.person.title", { name, level: trustWord(member.trust.level) })}
            </p>
            <p className="mt-0.5 text-body-sm text-ink-muted tabular-nums">
              {member.isMe
                ? t("trust.person.body.you", { amount: formatUsd(member.trust.instantUpTo, "whole") })
                : t("trust.person.body", { name, amount: formatUsd(member.trust.instantUpTo, "whole") })}{" "}
              {t("trust.person.history", { n: member.trust.settled })}
            </p>
          </div>
        )}
        {items.length === 0 ? (
          <EmptyState visual="dots" headingLevel={3} title={t("activity.person.empty")} className="rounded-md bg-surface-sunken py-8" />
        ) : (
          <ActivityList items={items} meId={meId} now={now} linked={false} showPot={false} sunken onOpen={(i) => i.requestId !== undefined && openRequest(i.requestId)} />
        )}
      </div>
    </Sheet>
  )
}
