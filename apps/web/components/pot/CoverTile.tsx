// The Pot cover: an emoji on one of six gradients built from the member tints and brand-soft (never marigold to
// marigold: a marigold block reads as a button). Drawn in CSS so the first paint needs no image (D-61: covers
// are emoji + gradient only).
import { cn } from "@/lib/client/cn"

export const COVER_GRADIENTS = [
  "from-member-1 to-member-4",
  "from-member-2 to-member-3",
  "from-member-5 to-member-3",
  "from-member-4 to-member-5",
  "from-member-6 to-member-2",
  "from-brand-soft to-member-1",
] as const

const SIZE = {
  sm: "size-8 rounded-sm text-base",
  md: "size-11 rounded-md text-2xl",
  lg: "size-14 rounded-md text-3xl",
  xl: "size-20 rounded-lg text-5xl",
  banner: "h-32 w-full rounded-lg text-6xl",
} as const

export function CoverTile({
  emoji,
  cover,
  size = "md",
  className,
}: {
  emoji: string
  cover: number
  size?: keyof typeof SIZE
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-grid shrink-0 place-items-center bg-linear-to-br leading-none select-none",
        COVER_GRADIENTS[((cover % 6) + 6) % 6],
        SIZE[size],
        className,
      )}
    >
      {emoji}
    </span>
  )
}
