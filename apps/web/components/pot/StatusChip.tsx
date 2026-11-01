// Status = icon + word + colour, never colour alone (brand README §4, ux-spec §3). A pill on surface-sunken:
// approved/sent = `approved` + check; needs = `waiting` + clock; declined/failed = `declined` + x;
// sending = ink-muted + send; expired = ink-muted + hourglass.
import { Check, Clock, Hourglass, Send, X } from "lucide-react"
import type { ReactNode } from "react"
import { t } from "@/i18n/t"
import { cn } from "@/lib/client/cn"

export type ChipStatus = "sending" | "sent" | "approved" | "needs" | "declined" | "expired" | "failed"

const META = {
  sending: { icon: Send, color: "text-ink-muted", key: "chip.sending" },
  sent: { icon: Check, color: "text-approved", key: "chip.sent" },
  approved: { icon: Check, color: "text-approved", key: "chip.approved" },
  needs: { icon: Clock, color: "text-waiting", key: "chip.needs" },
  declined: { icon: X, color: "text-declined", key: "chip.declined" },
  expired: { icon: Hourglass, color: "text-ink-muted", key: "chip.expired" },
  failed: { icon: X, color: "text-declined", key: "chip.failed" },
} as const

export function StatusChip({
  status,
  children,
  className,
}: {
  status: ChipStatus
  /** a more specific word, e.g. "1 of 2 approvals" for `needs` */
  children?: ReactNode
  className?: string
}) {
  const m = META[status]
  const Icon = m.icon
  return (
    <span
      data-status={status}
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1 rounded-pill bg-surface-sunken pr-2.5 pl-2 font-sans text-body-sm font-semibold whitespace-nowrap",
        m.color,
        className,
      )}
    >
      <Icon aria-hidden className="size-4" strokeWidth={2.25} />
      <span>{children ?? t(m.key)}</span>
    </span>
  )
}
