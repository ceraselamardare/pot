// The brand's one motif (brand README §8): three dots pulsing in sequence, for "Checking Pot rules" and the
// empty feed only. The pulse stops at 4.8 s (WCAG 2.2.2) and rests; under reduced motion the dots stay still.
// The dots are decorative: the text next to them is what screen readers hear.
import { cn } from "@/lib/client/cn"

export function TypingDots({ still, className, size = "md" }: { still?: boolean; className?: string; size?: "sm" | "md" | "lg" }) {
  const dot = size === "sm" ? "size-1.5" : size === "lg" ? "size-2.5" : "size-2"
  return (
    <span aria-hidden data-typing-dots className={cn("inline-flex items-center gap-1", still && "pot-dots-still", className)}>
      <span className={cn("pot-dot rounded-pill bg-current", dot)} />
      <span className={cn("pot-dot rounded-pill bg-current", dot)} />
      <span className={cn("pot-dot rounded-pill bg-current", dot)} />
    </span>
  )
}
