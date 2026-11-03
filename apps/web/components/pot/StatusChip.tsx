// Status = icon + word + colour, never colour alone (brand README §4, ux-spec §3). A pill on surface-sunken:
// approved/sent = `approved` + check; instant = `approved` + zap (approved by the Pot's rules); needs = `waiting` +
// clock; declined/failed = `declined` + x; sending = ink-muted + send; expired = ink-muted + hourglass; cancelled =
// ink-muted + ban (a top-up ask its asker took back).
// `size="sm"` is the compact chip of a list row's meta line (24 px); `ground="surface"` puts the pill on surface
// for rows that are themselves sunken or tinted (the instant row's brand-soft: `approved` text on it fails 4.5:1).
import { Ban, Check, Clock, Hourglass, Send, X, Zap } from "lucide-react"
import type { ReactNode } from "react"
import { t } from "@/i18n/t"
import { cn } from "@/lib/client/cn"

export type ChipStatus = "sending" | "sent" | "approved" | "instant" | "needs" | "declined" | "expired" | "failed" | "cancelled"

const META = {
  sending: { icon: Send, color: "text-ink-muted", key: "chip.sending" },
  sent: { icon: Check, color: "text-approved", key: "chip.sent" },
  approved: { icon: Check, color: "text-approved", key: "chip.approved" },
  instant: { icon: Zap, color: "text-approved", key: "chip.instant" },
  needs: { icon: Clock, color: "text-waiting", key: "chip.needs" },
  declined: { icon: X, color: "text-declined", key: "chip.declined" },
  expired: { icon: Hourglass, color: "text-ink-muted", key: "chip.expired" },
  failed: { icon: X, color: "text-declined", key: "chip.failed" },
  // "Ask for a top-up": the asker took it back (quiet, not a failure)
  cancelled: { icon: Ban, color: "text-ink-muted", key: "chip.cancelled" },
} as const

/** The pill's shape, shared with LinkStatusChip. */
export function chipClass(size: "md" | "sm" = "md", ground: "sunken" | "surface" = "sunken"): string {
  return cn(
    "inline-flex shrink-0 items-center gap-1 rounded-pill font-sans text-body-sm font-semibold whitespace-nowrap",
    size === "sm" ? "h-6 pr-2 pl-1.5" : "h-7 pr-2.5 pl-2",
    ground === "surface" ? "bg-surface" : "bg-surface-sunken",
  )
}

export const chipIconClass = (size: "md" | "sm" = "md") => (size === "sm" ? "size-3.5" : "size-4")

export function StatusChip({
  status,
  children,
  className,
  size = "md",
  ground = "sunken",
}: {
  status: ChipStatus
  /** a more specific word, e.g. "1 of 2 approvals" for `needs` */
  children?: ReactNode
  className?: string
  size?: "md" | "sm"
  ground?: "sunken" | "surface"
}) {
  const m = META[status]
  const Icon = m.icon
  return (
    <span data-status={status} className={cn(chipClass(size, ground), m.color, className)}>
      <Icon aria-hidden className={chipIconClass(size)} strokeWidth={2.25} />
      <span>{children ?? t(m.key)}</span>
    </span>
  )
}
