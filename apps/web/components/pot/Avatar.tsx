// Member avatars (brand README §4): colour member-((joinIndex mod 6) + 1) by join order in that Pot, eggplant
// `on-brand` initials in both themes. Invited-but-not-joined: surface-sunken with ink-muted initials.
import { cn } from "@/lib/client/cn"
import type { PersonVM } from "@/lib/client/mock/types"

const TINT = ["bg-member-1", "bg-member-2", "bg-member-3", "bg-member-4", "bg-member-5", "bg-member-6"] as const

const SIZE = {
  xs: "size-6 text-[0.625rem]",
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-12 text-base",
} as const

export function avatarTint(joinIndex: number | null): string {
  return joinIndex === null ? "bg-surface-sunken text-ink-muted" : `${TINT[joinIndex % 6]} text-on-brand`
}

export function Avatar({
  person,
  size = "sm",
  ring,
  className,
  decorative = true,
}: {
  person: Pick<PersonVM, "name" | "initials" | "joinIndex">
  size?: keyof typeof SIZE
  /** a 2 px ring in the colour the avatar sits on (stacks, tinted rows) */
  ring?: "ground" | "surface" | "brand-soft"
  className?: string
  decorative?: boolean
}) {
  return (
    <span
      aria-hidden={decorative || undefined}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : person.name}
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-pill font-sans font-bold select-none",
        SIZE[size],
        avatarTint(person.joinIndex),
        ring === "ground" && "ring-2 ring-ground",
        ring === "surface" && "ring-2 ring-surface",
        ring === "brand-soft" && "ring-2 ring-brand-soft",
        className,
      )}
    >
      {person.initials}
    </span>
  )
}

/** Overlapping seats (overlap space-2), up to `max`, then "+n". */
export function AvatarStack({
  people,
  max = 3,
  size = "sm",
  ring = "ground",
  className,
}: {
  people: Pick<PersonVM, "id" | "name" | "initials" | "joinIndex">[]
  max?: number
  size?: keyof typeof SIZE
  ring?: "ground" | "surface"
  className?: string
}) {
  const shown = people.slice(0, max)
  const extra = people.length - shown.length
  return (
    <span aria-hidden className={cn("flex items-center", className)}>
      {shown.map((p, i) => (
        <Avatar key={p.id} person={p} size={size} ring={ring} className={i > 0 ? "-ml-2" : undefined} />
      ))}
      {extra > 0 && (
        <span
          className={cn(
            "-ml-2 inline-grid place-items-center rounded-pill bg-surface-sunken font-sans text-xs font-bold text-ink-muted",
            SIZE[size],
            ring === "ground" ? "ring-2 ring-ground" : "ring-2 ring-surface",
          )}
        >
          +{extra}
        </span>
      )}
    </span>
  )
}
