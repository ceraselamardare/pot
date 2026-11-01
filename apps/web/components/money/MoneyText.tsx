// Every amount renders through MoneyText (frontend-architecture §7.2, test M-22): tabular figures, Gabarito for
// the hero, Figtree 700 for rows, two decimals for displayed amounts, U+2212 for money out.
import { cn } from "@/lib/client/cn"
import { formatSigned, formatUsd, type Micro, type MoneyStyle } from "@/lib/client/money"

export type MoneyVariant = "hero" | "title" | "row" | "inline"

const VARIANT: Record<MoneyVariant, string> = {
  // the biggest number caps at the viewport (F-25: 200 % text zoom still fits; it is already large text)
  hero: "font-display text-balance-hero max-xs:text-[2.25rem] max-xs:leading-10 [font-size:min(var(--text-balance-hero),15vw)] [line-height:1.1]",
  title: "font-display text-title",
  row: "font-sans text-amount",
  inline: "",
}

export function MoneyText({
  micro,
  variant = "row",
  style = "fixed",
  sign,
  className,
  strike,
}: {
  micro: Micro
  variant?: MoneyVariant
  style?: MoneyStyle
  sign?: "in" | "out"
  className?: string
  /** declined/expired: struck through; always paired with "Not sent" (design-direction 02 §5b) */
  strike?: boolean
}) {
  const text = sign ? formatSigned(micro, sign) : formatUsd(micro, style)
  return (
    <span data-money className={cn("whitespace-nowrap tabular-nums", VARIANT[variant], strike && "line-through", className)}>
      {text}
    </span>
  )
}
