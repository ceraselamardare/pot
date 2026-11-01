// A payment link's status as a chip and as a sentence (status = icon + word, never colour alone; brand README §4).
// Chip look = StatusChip's (pill on surface-sunken, `data-status` for the brand checks); the icons say what happened:
// a link waiting to be claimed, claimed, back in the Pot, expired, never sent.
import { Check, Clock, Hourglass, Link2, Send, Undo2, X } from "lucide-react"
import { t } from "@/i18n/t"
import type { LinkStatusVM, LinkVM } from "@/lib/client/mock/types"
import { formatDate } from "@/lib/client/time"
import { cn } from "@/lib/client/cn"

const META: Record<LinkStatusVM, { icon: typeof Check; color: string; key: Parameters<typeof t>[0] }> = {
  waiting: { icon: Clock, color: "text-waiting", key: "paylink.chip.waiting" },
  ready: { icon: Link2, color: "text-waiting", key: "paylink.chip.ready" },
  busy: { icon: Send, color: "text-ink-muted", key: "paylink.chip.busy" },
  claimed: { icon: Check, color: "text-approved", key: "paylink.chip.claimed" },
  expired: { icon: Hourglass, color: "text-ink-muted", key: "paylink.chip.expired" },
  returned: { icon: Undo2, color: "text-ink-muted", key: "paylink.chip.returned" },
  void: { icon: X, color: "text-declined", key: "paylink.chip.void" },
}

export function LinkStatusChip({ status, className }: { status: LinkStatusVM; className?: string }) {
  const m = META[status]
  const Icon = m.icon
  return (
    <span
      data-status={`link-${status}`}
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1 rounded-pill bg-surface-sunken pr-2.5 pl-2 font-sans text-body-sm font-semibold whitespace-nowrap",
        m.color,
        className,
      )}
    >
      <Icon aria-hidden className="size-4" strokeWidth={2.25} />
      <span>{t(m.key as "paylink.chip.ready")}</span>
    </span>
  )
}

/** "Link sent · waiting to be claimed", "Claimed by Alex", "Returned to the Pot"… `meId` turns my own claim into "you". */
export function linkStatusLine(l: LinkVM, meId: string | null): string {
  switch (l.status) {
    case "waiting":
      return t("paylink.status.waiting")
    case "ready":
      return `${t("paylink.status.ready")} · ${t("paylink.feed.until", { date: formatDate(l.expiresAt) })}`
    case "busy":
      return t("paylink.status.busy")
    case "claimed":
      return l.claimer ? (l.claimer.id === meId ? t("paylink.status.claimed_you") : t("paylink.status.claimed", { name: l.claimer.name })) : t("paylink.status.claimed_someone")
    case "expired":
      return t("paylink.status.expired")
    case "returned":
      return l.returnedOnExpiry ? t("paylink.status.returned_expiry") : t("paylink.status.returned")
    case "void":
      return t("paylink.status.void")
  }
}
