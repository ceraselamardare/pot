// Landing motion toolkit: an amount that rolls from `from` to `micro` when its sequence plays (data-seq="roll").
// A server component: it renders the FINAL amount through MoneyText (so the server HTML, no-JS and reduced motion
// all show `micro`), wrapped in a span that tells the sequence engine where to start. While its container is armed
// the text shows `from`; on play it counts to `micro` over `dur` ms (default 500, ease-standard), and it always ends
// on the server's exact text. When the digit count changes ($366.00 → $66.00, $0.00 → $66.00) it rolls a ghost copy
// over the hidden final amount, so the box keeps its final width (CLS 0); `align` says which edge the copy hugs
// ("end" for an amount at the end of its row, the default). Outside a [data-sequence] container it is just a
// MoneyText.
//
//   <RollingMoney from={dollars(450)} micro={dollars(366)} at={900} variant="title" className="text-ink" />
import { MoneyText, type MoneyVariant } from "@/components/money/MoneyText"
import { cn } from "@/lib/client/cn"
import type { Micro, MoneyStyle } from "@/lib/client/money"
import { moneyString } from "./roll"

export function RollingMoney({
  from,
  micro,
  at = 0,
  dur,
  variant,
  style,
  sign,
  className,
  wrapperClassName,
  align = "end",
}: {
  /** the amount it starts from */
  from: Micro
  /** the final amount (what the server renders) */
  micro: Micro
  /** ms after the sequence starts */
  at?: number
  /** roll duration in ms (default 500, duration-count) */
  dur?: number
  variant?: MoneyVariant
  style?: MoneyStyle
  sign?: "in" | "out"
  className?: string
  /** classes for the wrapper (a `relative inline-block` span) */
  wrapperClassName?: string
  /** which edge a ghost copy hugs when the digit count changes */
  align?: "start" | "end"
}) {
  const format = sign ?? style ?? "fixed"
  const widthChanges = moneyString(from, format).length !== moneyString(micro, format).length
  return (
    <span
      data-seq="roll"
      data-at={at}
      data-dur={dur}
      data-roll-from={String(from)}
      data-roll-to={String(micro)}
      data-roll-format={format}
      data-roll-ghost={widthChanges ? align : undefined}
      className={cn("relative inline-block", wrapperClassName)}
    >
      <MoneyText micro={micro} variant={variant} style={style} sign={sign} className={className} />
    </span>
  )
}
