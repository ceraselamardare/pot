// The compact list row (feed, a person's activity, You → Your activity, Requests, the record's phone cards).
// Anatomy (≈ 70 px; design-direction 02 §2.5, revised 2026-11-02 "rows got crowded"):
//   [40 px lead]  line 1: who · what (one line, truncates)              amount (signed, tabular)
//                 line 2: [status chip: icon + one word] 🧾 💬 2 …      time (or "Not sent" under a struck amount)
// The lead is the person's avatar with a small badge for the reason (ShoppingCart, Utensils…), or a tile with the
// kind's icon. Explanations ("Under the $100 instant limit", who approved, the merchant) live in the details sheet,
// which the whole row opens; the row's accessible name says everything in a sentence.
import {
  BedDouble,
  CarTaxiFront,
  MessageCircle,
  Plus,
  ReceiptText,
  ShoppingCart,
  Tag,
  Ticket,
  Utensils,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"
import { Avatar } from "@/components/pot/Avatar"
import { t } from "@/i18n/t"
import { cn } from "@/lib/client/cn"
import type { Category, PersonVM, RequestVM } from "@/lib/client/mock/types"
import { ago, formatDate, formatTime } from "@/lib/client/time"

/** What the row sits on: the page's surface card, a sheet's sunken row, or the instant spend's brand-soft tint. */
export type RowGround = "surface" | "sunken" | "tint"

const BG: Record<RowGround, string> = { surface: "bg-surface", sunken: "bg-surface-sunken", tint: "bg-brand-soft" }
const HOVER: Record<RowGround, string> = { surface: "hover:bg-surface-sunken", sunken: "hover:bg-line", tint: "hover:bg-brand-soft" }
const RING: Record<RowGround, string> = { surface: "ring-surface", sunken: "ring-surface-sunken", tint: "ring-brand-soft" }
/** chips and badges sit on surface when the row itself isn't surface */
export const chipGround = (g: RowGround) => (g === "surface" ? "sunken" : "surface")

export const REASON_ICON: Record<Category, LucideIcon> = {
  groceries: ShoppingCart,
  food: Utensils,
  transport: CarTaxiFront,
  stay: BedDouble,
  tickets: Ticket,
  other: Tag,
}

/** Line 1's "what": the reason's category ("Groceries"); "Other" gives way to the note when there is one. */
export function reasonTitle(r: { category?: Category; note?: string | null; reason?: string }): string {
  const c = r.category ?? "other"
  if (c === "other") return r.note?.trim() || r.reason?.trim() || t("row.reason.other")
  return t(`row.reason.${c}` as `row.reason.${Category}`)
}

/** "10 min ago" today, the clock time on older days (the day is the heading above); the long form for labels. */
export function rowWhen(at: number, now: number): { short: string; long: string } {
  const sameDay = now > 0 && new Date(at).toDateString() === new Date(now).toDateString()
  return sameDay ? { short: ago(at, now), long: ago(at, now) } : { short: formatTime(at), long: `${formatDate(at)}, ${formatTime(at)}` }
}

/** The row's accessible name: the parts as short sentences. */
export function rowLabel(parts: readonly (string | false | null | undefined)[]): string {
  return parts
    .filter((p): p is string => !!p && p.trim() !== "")
    .map((p) => p.trim().replace(/[.]$/, ""))
    .join(". ")
}

/** Line 1: "Maya · Groceries" (the name a touch bolder), with " · 🎿 Ski Chalet" when the list spans Pots. */
export function RowTitle({ who, what, pot }: { who?: string; what: string; pot?: { emoji: string; name: string } }) {
  return (
    <>
      {who && (
        <>
          <span className="font-semibold">{who}</span>
          <span aria-hidden> · </span>
        </>
      )}
      {what}
      {pot && (
        <span className="text-ink-muted">
          {" · "}
          {pot.emoji && <span aria-hidden>{pot.emoji} </span>}
          {pot.name}
        </span>
      )}
    </>
  )
}

/** A small round badge on the lead's corner (the reason, money in, a link). */
function Badge({ icon: Icon, ground }: { icon: LucideIcon; ground: RowGround }) {
  return (
    <span aria-hidden className={cn("absolute -right-1 -bottom-1 grid size-5 place-items-center rounded-pill text-ink ring-2", ground === "surface" ? "bg-surface-sunken" : "bg-surface", RING[ground])}>
      <Icon className="size-3" strokeWidth={2} />
    </span>
  )
}

/** The person's 40 px avatar with the reason's badge. */
export function LeadAvatar({ person, badge, ground = "surface" }: { person: PersonVM; badge?: LucideIcon; ground?: RowGround }) {
  return (
    <span className="relative shrink-0" data-row-lead>
      <Avatar person={person} size="md" ring={ground === "tint" ? "brand-soft" : undefined} />
      {badge && <Badge icon={badge} ground={ground} />}
    </span>
  )
}

/** A 40 px tile with an icon (a person's activity: what kind of thing they did), or any 40 px node with a badge. */
export function LeadTile({ icon: Icon, children, badge, ground = "surface" }: { icon?: LucideIcon; children?: ReactNode; badge?: LucideIcon; ground?: RowGround }) {
  return (
    <span className="relative shrink-0" data-row-lead>
      {children ?? (
        <span aria-hidden className={cn("grid size-10 place-items-center rounded-pill text-ink", ground === "surface" ? "bg-surface-sunken" : "bg-surface")}>
          {Icon && <Icon className="size-5" strokeWidth={2} />}
        </span>
      )}
      {badge && <Badge icon={badge} ground={ground} />}
    </span>
  )
}

/** "Receipt attached", icon only (the row's name says it in words). */
export function ReceiptMark() {
  return (
    <span className="inline-flex items-center" data-receipt-indicator title={t("details.receipt.indicator")}>
      <ReceiptText aria-hidden className="size-4 shrink-0" strokeWidth={2} />
      <span className="sr-only">{t("details.receipt.indicator")}</span>
    </span>
  )
}

/** 💬 2 */
export function CommentMark({ n }: { n: number | undefined }) {
  if (!n) return null
  return (
    <span className="inline-flex items-center gap-0.5 tabular-nums" data-comment-count={n}>
      <MessageCircle aria-hidden className="size-4" strokeWidth={2} />
      <span aria-hidden>{n}</span>
      <span className="sr-only">{t("comments.count", { n })}</span>
    </span>
  )
}

export const PlusIcon = Plus

export function CompactRow({
  lead,
  title,
  meta,
  aside,
  amount,
  ground = "surface",
  label,
  onOpen,
  href,
  fading,
  extra,
  className,
  ...data
}: {
  lead: ReactNode
  /** line 1 (one line, truncates) */
  title: ReactNode
  /** line 2, left: the status chip, the receipt and comment marks */
  meta?: ReactNode
  /** line 2, right: the time, or "Not sent" under a struck amount */
  aside?: ReactNode
  amount?: ReactNode
  ground?: RowGround
  /** the full accessible name (a row that opens something) */
  label?: string
  onOpen?: () => void
  href?: string
  fading?: boolean
  /** a sibling of the row's button (e.g. an explorer link over its corner), inside the <li> */
  extra?: ReactNode
  className?: string
} & { [k: `data-${string}`]: string | number | boolean | undefined }) {
  const body = (
    <>
      {lead}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-baseline gap-3">
          <span className="min-w-0 flex-1 truncate text-body text-ink" data-row-title>
            {title}
          </span>
          {amount && <span className="shrink-0">{amount}</span>}
        </span>
        {(meta || aside) && (
          <span className={cn("flex min-h-6 flex-wrap items-center gap-x-2 gap-y-1 text-body-sm", ground === "tint" ? "text-ink" : "text-ink-muted")} data-row-meta>
            {meta}
            {aside && <span className="ml-auto whitespace-nowrap tabular-nums">{aside}</span>}
          </span>
        )}
      </span>
    </>
  )
  const cls = cn("flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-[opacity,background-color] duration-200", BG[ground], fading && "opacity-0")
  return (
    <li className={cn("pot-enter relative list-none", className)} {...data}>
      {href ? (
        <Link href={href} aria-label={label} className={cn(cls, HOVER[ground])}>
          {body}
        </Link>
      ) : onOpen ? (
        <button type="button" onClick={onOpen} aria-label={label} className={cn(cls, HOVER[ground])}>
          {body}
        </button>
      ) : (
        <div className={cls} aria-label={label} role={label ? "group" : undefined}>
          {body}
        </div>
      )}
      {extra}
    </li>
  )
}

/** A spend's lead: the requester (or, once sent by the group, the person paid) with the reason's badge. */
export const reasonBadge = (r: Pick<RequestVM, "category">) => REASON_ICON[r.category] ?? Tag
