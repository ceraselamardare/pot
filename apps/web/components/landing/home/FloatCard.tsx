// A UI card that "breaks out" of the phone (the "Approved by Pot rules" result, a request card, the invite):
// `surface`, radius-lg, `shadow-card`, an optional tilt. It renders complete and still on its own; motion comes
// through `className` / `style` and any other attribute, which it forwards to its root (e.g. a landing sequence's
// `data-seq="fade-up"` + `style={seqVars(…)}`). The tilt uses the CSS `rotate` property, which composes with a
// motion `transform` (translate / scale) instead of being overwritten by it; if you animate rotation too, pass
// tilt={0}.
//
// Semantics: aria-hidden by default (it decorates a <PhoneFrame> whose label already says what happens);
// pass `label` to make it one image with its own sentence.
import { cn } from "@/lib/client/cn"

type Rest = Omit<React.ComponentPropsWithoutRef<"div">, "children" | "className" | "style" | "role" | "aria-label" | "aria-hidden">

export function FloatCard({
  children,
  tilt = 0,
  label,
  className,
  style,
  ...rest
}: Rest & {
  children: React.ReactNode
  /** degrees; small values read best (−4 … 4) */
  tilt?: number
  /** makes the card one image with this sentence; otherwise it is aria-hidden */
  label?: string
  /** padding, width, position, a motion hook (default padding p-3) */
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <div
      {...rest}
      data-float-card
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("rounded-lg bg-surface p-3 text-ink shadow-card", className)}
      style={{ ...(tilt ? { rotate: `${tilt}deg` } : null), ...style }}
    >
      {label ? <div aria-hidden>{children}</div> : children}
    </div>
  )
}
